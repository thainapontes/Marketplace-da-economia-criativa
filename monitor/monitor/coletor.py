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
- Na P3 só existe a produtora de hardware; containers e serviços entram na P4.
"""

import os
import threading
import time
import traceback

from estruturas import EstruturaCheiaError, EstruturaVaziaError, FilaCircular, TabelaHash

from . import proc

CAPACIDADE_DO_BUFFER = int(os.environ.get("BUFFER", 64))
TAMANHO_DO_HISTORICO = int(os.environ.get("HISTORICO", 120))  # amostras guardadas por nível
INTERVALO_HARDWARE = float(os.environ.get("INTERVALO_HARDWARE", 2))


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
    def _consumir(self) -> None:
        while not self._parar.is_set():
            try:
                amostra = self.buffer.retirar(timeout=0.5)
            except EstruturaVaziaError:
                continue
            self.estado.registrar(amostra)

    # ---------------------------------------------------------------- ciclo
    def _iniciar_thread(self, nome: str, alvo, *args) -> None:
        t = threading.Thread(target=alvo, args=args, name=nome, daemon=True)
        self._threads.colocar(nome, t)
        t.start()

    def iniciar(self) -> None:
        self._iniciar_thread("consumidor", self._consumir)
        self._iniciar_thread("hardware", self._produzir, "hardware", INTERVALO_HARDWARE, self._medidor_de_hardware())

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
        s.colocar("amostras_hardware", self.estado.recebidas("hardware"))
        return s
