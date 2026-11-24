"""Eventos e alertas do monitor.

A thread consumidora passa cada amostra pelo AnalisadorDeAlertas, que compara
com o que viu antes e gera Eventos só quando algo MUDA: entrar em alerta,
piorar, normalizar, cair, voltar, reiniciar, ser morto pelo OOM Killer. Uma
memória parada em 85% gera um alerta, não um a cada amostra.

Os eventos ficam numa FilaCircular (os últimos N, para o painel) e são
gravados em JSONL, uma linha por evento, sem apagar os anteriores.
"""

import json
import os
import threading
import time

from estruturas import FilaCircular, ListaEncadeada, TabelaHash

ARQUIVO = os.environ.get("ARQUIVO_EVENTOS", "")
GUARDADOS = int(os.environ.get("EVENTOS_GUARDADOS", 300))

# Limiares de memória, em % (do limite do container, ou do total da máquina).
ATENCAO = float(os.environ.get("ALERTA_MEMORIA_ATENCAO", 80))
CRITICO = float(os.environ.get("ALERTA_MEMORIA_CRITICO", 95))
NORMAL = float(os.environ.get("ALERTA_MEMORIA_NORMAL", 70))  # histerese: abaixo disso, normalizou
LATENCIA_LENTA_MS = float(os.environ.get("ALERTA_LATENCIA_MS", 1000))

INFO, ATENCAO_, CRITICO_ = "info", "atencao", "critico"


class Evento:
    __slots__ = ("instante", "nivel", "severidade", "origem", "mensagem")

    def __init__(self, nivel: str, severidade: str, origem: str, mensagem: str):
        self.instante = time.time()
        self.nivel = nivel
        self.severidade = severidade
        self.origem = origem
        self.mensagem = mensagem

    def como_tabela(self) -> TabelaHash:
        t = TabelaHash()
        for campo in self.__slots__:
            t.colocar(campo, getattr(self, campo))
        return t


class RegistroDeEventos:
    def __init__(self, arquivo: str = ARQUIVO, guardados: int = GUARDADOS):
        self._fila = FilaCircular(guardados)
        self._arquivo = arquivo
        self._trava_arquivo = threading.Lock()
        self._contagem = TabelaHash()  # severidade → total desde o início
        self._trava_contagem = threading.Lock()

    def registrar(self, evento: Evento) -> None:
        self._fila.colocar_descartando(evento)
        with self._trava_contagem:
            self._contagem.colocar(evento.severidade, self._contagem.obter(evento.severidade, 0) + 1)
        print(f"[evento] {evento.severidade:8} {evento.nivel}/{evento.origem}: {evento.mensagem}", flush=True)
        if self._arquivo:
            linha = json.dumps({c: getattr(evento, c) for c in Evento.__slots__}, ensure_ascii=False)
            with self._trava_arquivo, open(self._arquivo, "a", encoding="utf-8") as f:
                f.write(linha + "\n")

    def recentes(self, limite: int = 100) -> ListaEncadeada:
        """Do mais novo para o mais antigo."""
        todos = self._fila.instantaneo()
        saida = ListaEncadeada()
        for evento in todos.reverso():
            if len(saida) >= limite:
                break
            saida.inserir_fim(evento.como_tabela())
        return saida

    def contagem(self) -> TabelaHash:
        with self._trava_contagem:
            copia = TabelaHash()
            for k, v in self._contagem.itens():
                copia.colocar(k, v)
            return copia


def _faixa(percentual: float, faixa_anterior: str) -> str:
    """Faixa de memória com histerese: só volta a "normal" abaixo de NORMAL."""
    if percentual >= CRITICO:
        return CRITICO_
    if percentual >= ATENCAO:
        return ATENCAO_
    if faixa_anterior != "normal" and percentual >= NORMAL:
        return faixa_anterior if faixa_anterior == ATENCAO_ else ATENCAO_
    return "normal"


class AnalisadorDeAlertas:
    """Guarda o último estado de cada coisa monitorada e gera eventos nas mudanças.

    Usado só pela thread consumidora, então não precisa de trava própria.
    """

    def __init__(self, registro: RegistroDeEventos):
        self.registro = registro
        self._visto = TabelaHash()  # chave → último valor observado

    def _mudou(self, chave: str, valor):
        """Devolve o valor anterior se mudou (ou o marcador de primeira vez), e guarda o novo."""
        anterior = self._visto.obter(chave, _PRIMEIRA)
        self._visto.colocar(chave, valor)
        return anterior

    def _virou(self, chave: str, ativo: bool) -> bool:
        """Para condições liga/desliga: True quando o estado muda, ou na 1ª leitura se já começa ligado."""
        anterior = self._mudou(chave, ativo)
        return (anterior is _PRIMEIRA and ativo) or (anterior is not _PRIMEIRA and anterior != ativo)

    def _evento(self, nivel, severidade, origem, mensagem):
        self.registro.registrar(Evento(nivel, severidade, origem, mensagem))

    def _memoria(self, nivel: str, origem: str, percentual: float, detalhe: str) -> None:
        chave = f"mem:{nivel}:{origem}"
        anterior = self._visto.obter(chave, "normal")
        faixa = _faixa(percentual, anterior)
        self._visto.colocar(chave, faixa)
        if faixa == anterior:
            return
        if faixa == "normal":
            self._evento(nivel, INFO, origem, f"memória normalizou: {percentual:.0f}% ({detalhe})")
        else:
            rotulo = "crítica" if faixa == CRITICO_ else "alta"
            self._evento(nivel, faixa, origem, f"memória {rotulo}: {percentual:.0f}% ({detalhe})")

    # ------------------------------------------------------------- por nível
    def hardware(self, a: TabelaHash) -> None:
        m = a["memoria"]
        self._memoria("hardware", "máquina", m["percentual"], f"{m['usada'] // 2**20} MB de {m['total'] // 2**20} MB")
        for d in a["discos"]:
            cheio = d["percentual"] >= 90
            if self._virou(f"disco:{d['montagem']}", cheio):
                if cheio:
                    self._evento("hardware", ATENCAO_, d["montagem"], f"disco quase cheio: {d['percentual']:.0f}%")
                else:
                    self._evento("hardware", INFO, d["montagem"], f"disco voltou abaixo de 90%: {d['percentual']:.0f}%")

    def containers(self, lista: ListaEncadeada) -> None:
        for c in lista:
            nome = c["nome"]
            status_anterior = self._mudou(f"status:{nome}", c["status"])
            if status_anterior is _PRIMEIRA:
                self._evento("containers", INFO, nome, f"container detectado ({c['status']})")
            elif status_anterior != c["status"]:
                grave = c["status"] in ("exited", "dead") or (c["status"] == "restarting")
                self._evento("containers", ATENCAO_ if grave else INFO, nome, f"status: {status_anterior} → {c['status']}")

            oom_anterior = self._mudou(f"oom:{nome}", c["oom_killed"])
            if c["oom_killed"] and oom_anterior is not True:
                self._evento("containers", CRITICO_, nome,
                             f"morto pelo OOM Killer (limite de {c['memoria_limite'] // 2**20 or '?'} MB, código {c['codigo_saida']})")

            reinicios_anteriores = self._mudou(f"reinicios:{nome}", c["reinicios"])
            if reinicios_anteriores is not _PRIMEIRA and c["reinicios"] > reinicios_anteriores:
                self._evento("containers", ATENCAO_, nome, f"reiniciou (total: {c['reinicios']})")

            health_anterior = self._mudou(f"health:{nome}", c["health"])
            if health_anterior not in (_PRIMEIRA, None) and c["health"] != health_anterior:
                ruim = c["health"] == "unhealthy"
                self._evento("containers", ATENCAO_ if ruim else INFO, nome, f"health: {health_anterior} → {c['health']}")

            # Memória só vale para container rodando: um container morto usa 0 MB, e isso não é
            # "normalizar". Ao parar, a faixa volta a normal em silêncio (o evento é o de status/OOM).
            if c["status"] != "running":
                self._visto.colocar(f"mem:containers:{nome}", "normal")
            elif c["memoria_limite"]:
                self._memoria("containers", nome, c["memoria_percentual"],
                              f"{c['memoria_uso'] // 2**20} MB de {c['memoria_limite'] // 2**20} MB")

    def servicos(self, lista: ListaEncadeada) -> None:
        for s in lista:
            nome = s["nome"]
            anterior = self._mudou(f"servico:{nome}", s["ok"])
            if anterior is _PRIMEIRA:
                if not s["ok"]:
                    self._evento("servicos", ATENCAO_, nome, f"fora do ar ({s['erro']})")
            elif anterior and not s["ok"]:
                self._evento("servicos", CRITICO_, nome, f"caiu ({s['erro']})")
            elif not anterior and s["ok"]:
                self._evento("servicos", INFO, nome, f"voltou ({s['latencia_ms']:.0f} ms)")
            lento = s["ok"] and s["latencia_ms"] > LATENCIA_LENTA_MS
            if self._virou(f"lento:{nome}", lento):
                if lento:
                    self._evento("servicos", ATENCAO_, nome, f"resposta lenta: {s['latencia_ms']:.0f} ms")
                else:
                    self._evento("servicos", INFO, nome, "tempo de resposta normalizou")


class _Primeira:
    def __repr__(self):
        return "<primeira leitura>"


_PRIMEIRA = _Primeira()
