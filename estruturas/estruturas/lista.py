"""Lista duplamente encadeada.

No Origem representa o estoque do catálogo: percorrer todos os produtos para
pontuar ou filtrar, inserir e remover produtos, e manter a saída de estoque em
ordem de prioridade com ``inserir_ordenado``.
"""

from .erros import EstruturaVaziaError


class _No:
    __slots__ = ("valor", "anterior", "proximo")

    def __init__(self, valor, anterior=None, proximo=None):
        self.valor = valor
        self.anterior = anterior
        self.proximo = proximo


def _identidade(valor):
    return valor


class ListaEncadeada:
    """Lista com ponteiros para o início e o fim.

    | operação                          | custo |
    |-----------------------------------|-------|
    | inserir_inicio / inserir_fim       | O(1)  |
    | remover_inicio / remover_fim       | O(1)  |
    | obter / inserir_em / remover_em    | O(n)  |
    | buscar / remover / contém          | O(n)  |
    | inserir_ordenado                   | O(n)  |
    """

    __slots__ = ("_inicio", "_fim", "_tamanho")

    def __init__(self, valores=None):
        self._inicio = None
        self._fim = None
        self._tamanho = 0
        if valores is not None:
            for valor in valores:
                self.inserir_fim(valor)

    # ------------------------------------------------------------- consulta
    def __len__(self) -> int:
        return self._tamanho

    def vazia(self) -> bool:
        return self._tamanho == 0

    def __iter__(self):
        no = self._inicio
        while no is not None:
            yield no.valor
            no = no.proximo

    def reverso(self):
        no = self._fim
        while no is not None:
            yield no.valor
            no = no.anterior

    def primeiro(self):
        if self._inicio is None:
            raise EstruturaVaziaError("lista vazia")
        return self._inicio.valor

    def ultimo(self):
        if self._fim is None:
            raise EstruturaVaziaError("lista vazia")
        return self._fim.valor

    def _no_em(self, indice: int) -> _No:
        if not isinstance(indice, int) or not 0 <= indice < self._tamanho:
            raise IndexError(f"índice {indice} fora da lista de tamanho {self._tamanho}")
        # Anda pelo lado mais próximo: no pior caso percorre metade da lista.
        if indice < self._tamanho // 2:
            no = self._inicio
            for _ in range(indice):
                no = no.proximo
        else:
            no = self._fim
            for _ in range(self._tamanho - 1 - indice):
                no = no.anterior
        return no

    def obter(self, indice: int):
        return self._no_em(indice).valor

    def __getitem__(self, indice: int):
        return self.obter(indice)

    def buscar(self, condicao):
        """Primeiro valor que satisfaz ``condicao`` (busca sequencial), ou None."""
        for valor in self:
            if condicao(valor):
                return valor
        return None

    def indice_de(self, valor) -> int:
        """Posição da primeira ocorrência de ``valor``, ou -1."""
        i = 0
        for atual in self:
            if atual == valor:
                return i
            i += 1
        return -1

    def __contains__(self, valor) -> bool:
        return self.indice_de(valor) >= 0

    # ------------------------------------------------------------- inserção
    def inserir_inicio(self, valor) -> None:
        no = _No(valor, None, self._inicio)
        if self._inicio is None:
            self._fim = no
        else:
            self._inicio.anterior = no
        self._inicio = no
        self._tamanho += 1

    def inserir_fim(self, valor) -> None:
        no = _No(valor, self._fim, None)
        if self._fim is None:
            self._inicio = no
        else:
            self._fim.proximo = no
        self._fim = no
        self._tamanho += 1

    def _inserir_antes(self, referencia: _No, valor) -> None:
        if referencia is self._inicio:
            self.inserir_inicio(valor)
            return
        no = _No(valor, referencia.anterior, referencia)
        referencia.anterior.proximo = no
        referencia.anterior = no
        self._tamanho += 1

    def inserir_em(self, indice: int, valor) -> None:
        if indice == self._tamanho:
            self.inserir_fim(valor)
            return
        self._inserir_antes(self._no_em(indice), valor)

    def inserir_ordenado(self, valor, chave=_identidade, decrescente: bool = False) -> None:
        """Insere mantendo a lista em ordem de ``chave``. Iguais entram depois dos já existentes (estável)."""
        k = chave(valor)
        no = self._inicio
        while no is not None:
            atual = chave(no.valor)
            if (atual < k) if decrescente else (atual > k):
                self._inserir_antes(no, valor)
                return
            no = no.proximo
        self.inserir_fim(valor)

    # ------------------------------------------------------------- remoção
    def _desligar(self, no: _No):
        if no.anterior is None:
            self._inicio = no.proximo
        else:
            no.anterior.proximo = no.proximo
        if no.proximo is None:
            self._fim = no.anterior
        else:
            no.proximo.anterior = no.anterior
        no.anterior = no.proximo = None
        self._tamanho -= 1
        return no.valor

    def remover_inicio(self):
        if self._inicio is None:
            raise EstruturaVaziaError("lista vazia")
        return self._desligar(self._inicio)

    def remover_fim(self):
        if self._fim is None:
            raise EstruturaVaziaError("lista vazia")
        return self._desligar(self._fim)

    def remover_em(self, indice: int):
        return self._desligar(self._no_em(indice))

    def remover(self, valor) -> bool:
        """Remove a primeira ocorrência de ``valor``. Devolve se encontrou."""
        no = self._inicio
        while no is not None:
            if no.valor == valor:
                self._desligar(no)
                return True
            no = no.proximo
        return False

    def remover_se(self, condicao) -> int:
        """Remove todos os valores que satisfazem ``condicao``. Devolve quantos saíram."""
        removidos = 0
        no = self._inicio
        while no is not None:
            seguinte = no.proximo
            if condicao(no.valor):
                self._desligar(no)
                removidos += 1
            no = seguinte
        return removidos

    def limpar(self) -> None:
        self._inicio = self._fim = None
        self._tamanho = 0

    def __repr__(self) -> str:
        partes = ""
        for valor in self:
            partes += ("" if not partes else ", ") + repr(valor)
        return f"ListaEncadeada([{partes}])"
