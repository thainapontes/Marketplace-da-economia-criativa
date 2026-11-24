"""Pilha encadeada (LIFO).

No Origem guarda o histórico de operações de estoque: a última operação feita é
a primeira a ser desfeita.
"""

from .erros import EstruturaVaziaError


class _No:
    __slots__ = ("valor", "abaixo")

    def __init__(self, valor, abaixo):
        self.valor = valor
        self.abaixo = abaixo


class Pilha:
    """Empilhar, desempilhar e consultar o topo em O(1)."""

    __slots__ = ("_topo", "_tamanho")

    def __init__(self):
        self._topo = None
        self._tamanho = 0

    def __len__(self) -> int:
        return self._tamanho

    def vazia(self) -> bool:
        return self._topo is None

    def empilhar(self, valor) -> None:
        self._topo = _No(valor, self._topo)
        self._tamanho += 1

    def desempilhar(self):
        if self._topo is None:
            raise EstruturaVaziaError("pilha vazia")
        no = self._topo
        self._topo = no.abaixo
        self._tamanho -= 1
        return no.valor

    def topo(self):
        if self._topo is None:
            raise EstruturaVaziaError("pilha vazia")
        return self._topo.valor

    def __iter__(self):
        """Do topo para a base."""
        no = self._topo
        while no is not None:
            yield no.valor
            no = no.abaixo
