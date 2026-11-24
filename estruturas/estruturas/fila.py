"""Fila encadeada (FIFO), sem limite de tamanho.

No Origem representa os pedidos aguardando processamento, na ordem de chegada,
como a fila de eventos que o worker consome.
"""

from .erros import EstruturaVaziaError


class _No:
    __slots__ = ("valor", "proximo")

    def __init__(self, valor):
        self.valor = valor
        self.proximo = None


class Fila:
    """Enfileirar no fim e desenfileirar do início, os dois em O(1)."""

    __slots__ = ("_inicio", "_fim", "_tamanho")

    def __init__(self):
        self._inicio = None
        self._fim = None
        self._tamanho = 0

    def __len__(self) -> int:
        return self._tamanho

    def vazia(self) -> bool:
        return self._inicio is None

    def enfileirar(self, valor) -> None:
        no = _No(valor)
        if self._fim is None:
            self._inicio = no
        else:
            self._fim.proximo = no
        self._fim = no
        self._tamanho += 1

    def desenfileirar(self):
        if self._inicio is None:
            raise EstruturaVaziaError("fila vazia")
        no = self._inicio
        self._inicio = no.proximo
        if self._inicio is None:
            self._fim = None
        self._tamanho -= 1
        return no.valor

    def frente(self):
        if self._inicio is None:
            raise EstruturaVaziaError("fila vazia")
        return self._inicio.valor

    def __iter__(self):
        """Da frente para o fim."""
        no = self._inicio
        while no is not None:
            yield no.valor
            no = no.proximo
