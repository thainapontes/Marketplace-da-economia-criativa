"""Coletor concorrente: produtor–consumidor com threads e buffer sincronizado.

    thread "hardware"   ─┐
    thread "containers" ─┼─► FilaCircular (buffer, Lock + Condition) ─► thread "consumidor" ─► Estado
    thread "servicos"   ─┘                                                (último + histórico + eventos)

- Cada thread produtora mede um nível do painel num intervalo próprio e coloca
  uma Amostra no buffer. Se o buffer estiver cheio, ela espera até um intervalo;
  se mesmo assim não vagar, conta a amostra como perdida e segue (o monitor não
  pode travar porque o consumidor atrasou).
- A thread consumidora retira as amostras na ordem de chegada e atualiza o
  Estado, que é o que a API do coletor serve ao painel.
- A consumidora também passa cada amostra pelo AnalisadorDeAlertas, que gera
  os eventos (memória alta, OOM, reinício, serviço caiu...) — ver eventos.py.
"""

import os
import threading
import time
import traceback

from estruturas import EstruturaCheiaError, EstruturaVaziaError, FilaCircular, TabelaHash

from . import proc, servicos
from .containers import MedidorDeContainers
from .eventos import INFO, AnalisadorDeAlertas, Evento, RegistroDeEventos

CAPACIDADE_DO_BUFFER = int(os.environ.get("BUFFER", 64))
TAMANHO_DO_HISTORICO = int(os.environ.get("HISTORICO", 120))  # amostras guardadas por nível
INTERVALO_HARDWARE = float(os.environ.get("INTERVALO_HARDWARE", 2))
INTERVALO_CONTAINERS = float(os.environ.get("INTERVALO_CONTAINERS", 3))
INTERVALO_SERVICOS = float(os.environ.get("INTERVALO_SERVICOS", 3))
MONITORAR_CONTAINERS = os.environ.get("MONITORAR_CONTAINERS", "1") == "1"
MONITORAR_SERVICOS = os.environ.get("MONITORAR_SERVICOS", "1") == "1"


class Amostra:
    __slots__ = ("nivel", "instante", "dados", "produtor")

    def __init__(self, nivel: str, dados, produtor: str):
        self.nivel = nivel
        self.instante = time.time()
        self.dados = dados
        self.produtor = produtor


class Estado:
    """O que o coletor sabe agora. Lido pela API (thread do servidor) e escrito pelo consumidor.

    A TabelaHash não é segura para threads, então todo acesso passa pela trava.
    O histórico de cada nível é uma FilaCircular: guarda só as últimas N amostras.
    """

    def __init__(self):
        self._trava = threading.Lock()
        self._ultimo = TabelaHash()      # nível → dados da última amostra
        self._historico = TabelaHash()   # nível → FilaCircular de amostras
        self._contadores = TabelaHash()  # nível → amostras recebidas

    def registrar(self, amostra: Amostra) -> None:
        with self._trava:
            self._ultimo.colocar(amostra.nivel, amostra.dados)
            if amostra.nivel not in self._historico:
                self._historico.colocar(amostra.nivel, FilaCircular(TAMANHO_DO_HISTORICO))
            self._historico[amostra.nivel].colocar_descartando(amostra.dados)
            self._contadores.colocar(amostra.nivel, self._contadores.obter(amostra.nivel, 0) + 1)

    def ultimo(self, nivel: str):
        with self._trava:
            return self._ultimo.obter(nivel, None)

    def historico(self, nivel: str):
        with self._trava:
            fila = self._historico.obter(nivel, None)
        return fila.instantaneo() if fila is not None else None  # a FilaCircular tem trava própria

    def recebidas(self, nivel: str) -> int:
        with self._trava:
            return self._contadores.obter(nivel, 0)


class Coletor:
    def __init__(self):
        self.buffer = FilaCircular(CAPACIDADE_DO_BUFFER)
        self.estado = Estado()
        self.iniciado_em = time.time()
        self._parar = threading.Event()
        self._threads = TabelaHash()  # nome → Thread
        self._trava_contadores = threading.Lock()
        self._perdidas = 0
        self._erros = 0
        self.eventos = RegistroDeEventos()
        self._analisador = AnalisadorDeAlertas(self.eventos)
        self._medidor_containers = MedidorDeContainers()
        # Só a thread consumidora mexe nestas duas: serviço → instante em que ficou no ar / (ok, total).
        self._no_ar_desde = TabelaHash()
        self._checagens = TabelaHash()

    # ------------------------------------------------------------ produtores
    def _produzir(self, nivel: str, intervalo: float, medir) -> None:
        """Laço genérico de uma thread produtora: medir, colocar no buffer, esperar o intervalo."""
        nome = threading.current_thread().name
        while not self._parar.is_set():
            inicio = time.monotonic()
            try:
                dados = medir()
                try:
                    self.buffer.colocar(Amostra(nivel, dados, nome), timeout=intervalo)
                except EstruturaCheiaError:
                    with self._trava_contadores:
                        self._perdidas += 1
            except Exception:  # uma medição que falha não pode matar a thread
                with self._trava_contadores:
                    self._erros += 1
                traceback.print_exc()
            # Espera o que falta do intervalo; Event.wait acorda na hora se pedirem para parar.
            self._parar.wait(max(0.0, intervalo - (time.monotonic() - inicio)))

    def _medidor_de_hardware(self):
        tempos = proc.tempos_de_cpu()  # 1ª leitura: base para a diferença do uso de CPU

        def medir():
            nonlocal tempos
            amostra, tempos = proc.amostra_de_hardware(tempos)
            return amostra

        return medir

    # ------------------------------------------------------------ consumidor
    def _completar_servicos(self, lista) -> None:
        """Acrescenta a cada serviço o tempo no ar e a disponibilidade desde que o monitor começou."""
        agora = time.time()
        for s in lista:
            nome = s["nome"]
            ok, total = self._checagens.obter(nome, (0, 0))
            self._checagens.colocar(nome, (ok + (1 if s["ok"] else 0), total + 1))
            if s["ok"]:
                if nome not in self._no_ar_desde:
                    self._no_ar_desde.colocar(nome, agora)
                s.colocar("no_ar_ha_s", int(agora - self._no_ar_desde[nome]))
            else:
                if nome in self._no_ar_desde:
                    self._no_ar_desde.remover(nome)
                s.colocar("no_ar_ha_s", 0)
            ok, total = self._checagens[nome]
            s.colocar("disponibilidade", round(100 * ok / total, 1))

    def _consumir(self) -> None:
        analisar = TabelaHash()
        analisar.colocar("hardware", self._analisador.hardware)
        analisar.colocar("containers", self._analisador.containers)
        analisar.colocar("servicos", self._analisador.servicos)
        while not self._parar.is_set():
            try:
                amostra = self.buffer.retirar(timeout=0.5)
            except EstruturaVaziaError:
                continue
            try:
                if amostra.nivel == "servicos":
                    self._completar_servicos(amostra.dados)
                analisar[amostra.nivel](amostra.dados)
            except Exception:  # um erro na análise não pode parar o consumo
                with self._trava_contadores:
                    self._erros += 1
                traceback.print_exc()
            self.estado.registrar(amostra)

    # ---------------------------------------------------------------- ciclo
    def _iniciar_thread(self, nome: str, alvo, *args) -> None:
        t = threading.Thread(target=alvo, args=args, name=nome, daemon=True)
        self._threads.colocar(nome, t)
        t.start()

    def iniciar(self) -> None:
        self.eventos.registrar(Evento("monitor", INFO, "coletor", "monitor iniciado"))
        self._iniciar_thread("consumidor", self._consumir)
        self._iniciar_thread("hardware", self._produzir, "hardware", INTERVALO_HARDWARE, self._medidor_de_hardware())
        if MONITORAR_CONTAINERS:
            self._iniciar_thread("containers", self._produzir, "containers", INTERVALO_CONTAINERS,
                                 self._medidor_containers.medir)
        if MONITORAR_SERVICOS:
            lista = servicos.lista_de_servicos()
            self._iniciar_thread("servicos", self._produzir, "servicos", INTERVALO_SERVICOS,
                                 lambda: servicos.medir(lista))

    def parar(self, espera: float = 5) -> None:
        self._parar.set()
        for _, t in self._threads.itens():
            t.join(timeout=espera)

    def situacao(self) -> TabelaHash:
        """Estado das próprias threads e do buffer, para o painel mostrar o coletor funcionando."""
        threads = TabelaHash()
        for nome, t in self._threads.itens():
            threads.colocar(nome, t.is_alive())
        s = TabelaHash()
        s.colocar("ligado_ha_s", int(time.time() - self.iniciado_em))
        s.colocar("threads", threads)
        s.colocar("buffer_ocupado", len(self.buffer))
        s.colocar("buffer_capacidade", self.buffer.capacidade)
        with self._trava_contadores:
            s.colocar("amostras_perdidas", self._perdidas)
            s.colocar("erros_de_medicao", self._erros)
        for nivel in ("hardware", "containers", "servicos"):
            s.colocar(f"amostras_{nivel}", self.estado.recebidas(nivel))
        s.colocar("eventos", self.eventos.contagem())
        return s
