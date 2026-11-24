"""Tabela hash com encadeamento separado.

No Origem é o índice de produtos por id (código do produto): o módulo de IA
consulta o produto de cada id muitas vezes por recomendação, e a consulta
precisa ser O(1) em média.

Como funciona: um Vetor de "baldes"; a chave passa pela função de hash e o
resto da divisão pelo número de baldes diz em qual balde ela mora. Chaves que
caem no mesmo balde (colisão) ficam numa corrente de nós. Quando o fator de
carga (itens ÷ baldes) passa de 0,75, a tabela dobra e redistribui as chaves,
para as correntes continuarem curtas.
"""

from .erros import ChaveNaoEncontradaError
from .vetor import Vetor

_AUSENTE = object()


class _No:
    __slots__ = ("chave", "valor", "proximo")

    def __init__(self, chave, valor, proximo):
        self.chave = chave
        self.valor = valor
        self.proximo = proximo


class TabelaHash:
    """colocar, obter, remover e contém: O(1) em média, O(n) no pior caso (todas no mesmo balde)."""

    FATOR_MAXIMO = 0.75

    def __init__(self, capacidade_inicial: int = 16):
        self._baldes = Vetor(max(4, capacidade_inicial))
        self._tamanho = 0

    def __len__(self) -> int:
        return self._tamanho

    def vazia(self) -> bool:
        return self._tamanho == 0

    @property
    def numero_de_baldes(self) -> int:
        return self._baldes.capacidade

    @property
    def fator_de_carga(self) -> float:
        return self._tamanho / self._baldes.capacidade

    def _indice(self, chave, baldes=None) -> int:
        if baldes is None:
            baldes = self._baldes
        return hash(chave) % baldes.capacidade

    def _redimensionar(self) -> None:
        novos = Vetor(self._baldes.capacidade * 2)
        for i in range(self._baldes.capacidade):
            no = self._baldes[i]
            while no is not None:
                seguinte = no.proximo
                j = self._indice(no.chave, novos)
                no.proximo = novos[j]
                novos[j] = no
                no = seguinte
        self._baldes = novos

    def colocar(self, chave, valor) -> None:
        """Insere ou substitui o valor da chave."""
        i = self._indice(chave)
        no = self._baldes[i]
        while no is not None:
            if no.chave == chave:
                no.valor = valor
                return
            no = no.proximo
        self._baldes[i] = _No(chave, valor, self._baldes[i])
        self._tamanho += 1
        if self.fator_de_carga > self.FATOR_MAXIMO:
            self._redimensionar()

    def obter(self, chave, padrao=_AUSENTE):
        no = self._baldes[self._indice(chave)]
        while no is not None:
            if no.chave == chave:
                return no.valor
            no = no.proximo
        if padrao is _AUSENTE:
            raise ChaveNaoEncontradaError(chave)
        return padrao

    def __getitem__(self, chave):
        return self.obter(chave)

    def __setitem__(self, chave, valor) -> None:
        self.colocar(chave, valor)

    def __contains__(self, chave) -> bool:
        no = self._baldes[self._indice(chave)]
        while no is not None:
            if no.chave == chave:
                return True
            no = no.proximo
        return False

    def remover(self, chave):
        """Remove a chave e devolve o valor dela."""
        i = self._indice(chave)
        anterior = None
        no = self._baldes[i]
        while no is not None:
            if no.chave == chave:
                if anterior is None:
                    self._baldes[i] = no.proximo
                else:
                    anterior.proximo = no.proximo
                self._tamanho -= 1
                return no.valor
            anterior = no
            no = no.proximo
        raise ChaveNaoEncontradaError(chave)

    def chaves(self):
        for i in range(self._baldes.capacidade):
            no = self._baldes[i]
            while no is not None:
                yield no.chave
                no = no.proximo

    def itens(self):
        for i in range(self._baldes.capacidade):
            no = self._baldes[i]
            while no is not None:
                yield no.chave, no.valor
                no = no.proximo

    def __iter__(self):
        return self.chaves()
