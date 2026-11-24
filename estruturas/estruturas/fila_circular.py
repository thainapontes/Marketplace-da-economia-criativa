"""Fila circular de capacidade fixa, segura para várias threads.

É o buffer entre as threads do coletor do monitor: as threads coletoras
(produtoras) colocam amostras e a thread consumidora as retira. A memória é
fixa — um Vetor de ``capacidade`` posições reaproveitado em círculo —, então o
monitor nunca cresce sem limite, mesmo que o consumidor atrase.

Sincronização (problema do produtor–consumidor):
- um ``Lock`` protege os índices e o contador: sem ele, dois produtores podem
  ler o mesmo ``_fim``, gravar na mesma posição e uma amostra se perde
  (condição de corrida);
- duas ``Condition`` sobre o mesmo Lock: ``_nao_vazia`` acorda consumidores
  quando chega um item, ``_nao_cheia`` acorda produtores quando sai um.

Quando a fila enche, há duas políticas:
- ``colocar``: espera vagar (ou falha depois do ``timeout``);
- ``colocar_descartando``: grava por cima do item mais antigo, para dados de
  monitoramento, em que a amostra nova vale mais que a velha.
"""

import threading

from .erros import EstruturaCheiaError, EstruturaVaziaError
from .lista import ListaEncadeada
from .vetor import Vetor


class FilaCircular:
    """Todas as operações são O(1); a espera, quando há, não consome CPU."""

    def __init__(self, capacidade: int):
        self._vetor = Vetor(capacidade)
        self._capacidade = capacidade
        self._inicio = 0  # posição do item mais antigo
        self._tamanho = 0
        self._descartados = 0
        self._trava = threading.Lock()
        self._nao_vazia = threading.Condition(self._trava)
        self._nao_cheia = threading.Condition(self._trava)

    # ------------------------------------------------------------- consulta
    @property
    def capacidade(self) -> int:
        return self._capacidade

    @property
    def descartados(self) -> int:
        """Quantos itens ``colocar_descartando`` já sobrescreveu."""
        with self._trava:
            return self._descartados

    def __len__(self) -> int:
        with self._trava:
            return self._tamanho

    def vazia(self) -> bool:
        with self._trava:
            return self._tamanho == 0

    def cheia(self) -> bool:
        with self._trava:
            return self._tamanho == self._capacidade

    def instantaneo(self) -> ListaEncadeada:
        """Cópia dos itens, do mais antigo ao mais novo, sem retirá-los."""
        copia = ListaEncadeada()
        with self._trava:
            for i in range(self._tamanho):
                copia.inserir_fim(self._vetor[(self._inicio + i) % self._capacidade])
        return copia

    # ---------------------------------------------- operações sem a trava
    # Só podem ser chamadas por quem já segura self._trava.
    def _gravar(self, item) -> None:
        fim = (self._inicio + self._tamanho) % self._capacidade
        self._vetor[fim] = item
        self._tamanho += 1
        self._nao_vazia.notify()

    def _ler(self):
        item = self._vetor[self._inicio]
        self._vetor[self._inicio] = None  # solta a referência para o coletor de lixo
        self._inicio = (self._inicio + 1) % self._capacidade
        self._tamanho -= 1
        self._nao_cheia.notify()
        return item

    # ------------------------------------------------------------- produtor
    def colocar(self, item, bloquear: bool = True, timeout: float | None = None) -> None:
        """Coloca no fim. Cheia: espera vagar (até ``timeout``) ou, sem bloquear, falha na hora."""
        with self._nao_cheia:
            if self._tamanho == self._capacidade:
                if not bloquear:
                    raise EstruturaCheiaError("fila circular cheia")
                # wait_for confere a condição de novo a cada aviso: evita o
                # "despertar espúrio" e a corrida entre dois produtores acordados.
                if not self._nao_cheia.wait_for(lambda: self._tamanho < self._capacidade, timeout):
                    raise EstruturaCheiaError("fila circular cheia: tempo de espera esgotado")
            self._gravar(item)

    def colocar_descartando(self, item):
        """Coloca no fim; se estiver cheia, descarta o mais antigo e o devolve (senão, None)."""
        with self._trava:
            descartado = None
            if self._tamanho == self._capacidade:
                descartado = self._vetor[self._inicio]
                self._inicio = (self._inicio + 1) % self._capacidade
                self._tamanho -= 1
                self._descartados += 1
            self._gravar(item)
            return descartado

    # ----------------------------------------------------------- consumidor
    def retirar(self, bloquear: bool = True, timeout: float | None = None):
        """Retira o mais antigo. Vazia: espera chegar (até ``timeout``) ou, sem bloquear, falha na hora."""
        with self._nao_vazia:
            if self._tamanho == 0:
                if not bloquear:
                    raise EstruturaVaziaError("fila circular vazia")
                if not self._nao_vazia.wait_for(lambda: self._tamanho > 0, timeout):
                    raise EstruturaVaziaError("fila circular vazia: tempo de espera esgotado")
            return self._ler()

    def espiar(self):
        """O mais antigo, sem retirar."""
        with self._trava:
            if self._tamanho == 0:
                raise EstruturaVaziaError("fila circular vazia")
            return self._vetor[self._inicio]
