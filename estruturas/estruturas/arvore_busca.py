"""Árvore binária de busca.

No Origem indexa os produtos pelo preço: buscar um preço exato ou todos os
produtos de uma faixa ("até R$ 200", "entre R$ 100 e R$ 300") sem percorrer o
catálogo inteiro. Vários produtos podem ter o mesmo preço, então cada nó guarda
uma ListaEncadeada com os valores daquela chave.

Custo: O(h), em que h é a altura. Com chaves em ordem aleatória, h ≈ log n;
com chaves inseridas já ordenadas a árvore vira uma "lista" e h = n (pior caso).
A árvore não se balanceia sozinha — isso é discutido na análise de complexidade.
"""

from .erros import ChaveNaoEncontradaError, EstruturaVaziaError
from .fila import Fila
from .lista import ListaEncadeada
from .pilha import Pilha


class _No:
    __slots__ = ("chave", "valores", "esquerda", "direita")

    def __init__(self, chave, valor):
        self.chave = chave
        self.valores = ListaEncadeada()
        self.valores.inserir_fim(valor)
        self.esquerda = None
        self.direita = None


class ArvoreBuscaBinaria:
    __slots__ = ("_raiz", "_tamanho", "_chaves")

    def __init__(self):
        self._raiz = None
        self._tamanho = 0  # quantidade de valores
        self._chaves = 0   # quantidade de nós (chaves distintas)

    def __len__(self) -> int:
        return self._tamanho

    @property
    def quantidade_de_chaves(self) -> int:
        return self._chaves

    def vazia(self) -> bool:
        return self._raiz is None

    # -------------------------------------------------------------- inserir
    def inserir(self, chave, valor) -> None:
        """Iterativo, para não estourar a pilha de recursão no pior caso (árvore degenerada)."""
        self._tamanho += 1
        if self._raiz is None:
            self._raiz = _No(chave, valor)
            self._chaves += 1
            return
        no = self._raiz
        while True:
            if chave == no.chave:
                no.valores.inserir_fim(valor)
                return
            lado = "esquerda" if chave < no.chave else "direita"
            filho = getattr(no, lado)
            if filho is None:
                setattr(no, lado, _No(chave, valor))
                self._chaves += 1
                return
            no = filho

    # ---------------------------------------------------------------- busca
    def _no_da_chave(self, chave):
        no = self._raiz
        while no is not None and chave != no.chave:
            no = no.esquerda if chave < no.chave else no.direita
        return no

    def buscar(self, chave) -> ListaEncadeada:
        """Valores com essa chave exata (lista vazia se não houver)."""
        no = self._no_da_chave(chave)
        return no.valores if no is not None else ListaEncadeada()

    def __contains__(self, chave) -> bool:
        return self._no_da_chave(chave) is not None

    def minimo(self):
        if self._raiz is None:
            raise EstruturaVaziaError("árvore vazia")
        no = self._raiz
        while no.esquerda is not None:
            no = no.esquerda
        return no.chave

    def maximo(self):
        if self._raiz is None:
            raise EstruturaVaziaError("árvore vazia")
        no = self._raiz
        while no.direita is not None:
            no = no.direita
        return no.chave

    def intervalo(self, minimo, maximo) -> ListaEncadeada:
        """Valores com chave em [minimo, maximo], em ordem crescente de chave.

        Só desce nos galhos que podem ter chaves na faixa: O(h + k), com k = resultados.
        """
        resultado = ListaEncadeada()
        # Percurso em ordem com pilha explícita (sem recursão), podando galhos.
        pilha = Pilha()
        no = self._raiz
        while no is not None or not pilha.vazia():
            while no is not None:
                pilha.empilhar(no)
                no = no.esquerda if no.chave > minimo else None
            no = pilha.desempilhar()
            if no.chave > maximo:
                break
            if no.chave >= minimo:
                for valor in no.valores:
                    resultado.inserir_fim(valor)
            no = no.direita
        return resultado

    def em_ordem(self):
        """Pares (chave, valor) em ordem crescente de chave."""
        pilha = Pilha()
        no = self._raiz
        while no is not None or not pilha.vazia():
            while no is not None:
                pilha.empilhar(no)
                no = no.esquerda
            no = pilha.desempilhar()
            for valor in no.valores:
                yield no.chave, valor
            no = no.direita

    def altura(self) -> int:
        """Número de níveis (árvore vazia = 0). Percurso em largura com a Fila própria."""
        if self._raiz is None:
            return 0
        fila = Fila()
        fila.enfileirar((self._raiz, 1))
        maior = 0
        while not fila.vazia():
            no, nivel = fila.desenfileirar()
            if nivel > maior:
                maior = nivel
            if no.esquerda is not None:
                fila.enfileirar((no.esquerda, nivel + 1))
            if no.direita is not None:
                fila.enfileirar((no.direita, nivel + 1))
        return maior

    # -------------------------------------------------------------- remover
    def remover(self, chave, valor=None) -> None:
        """Remove um valor da chave (ou a chave inteira, se ``valor`` for None)."""
        pai, no = None, self._raiz
        while no is not None and chave != no.chave:
            pai = no
            no = no.esquerda if chave < no.chave else no.direita
        if no is None:
            raise ChaveNaoEncontradaError(chave)

        if valor is not None:
            if not no.valores.remover(valor):
                raise ChaveNaoEncontradaError((chave, valor))
            self._tamanho -= 1
            if not no.valores.vazia():
                return
        else:
            self._tamanho -= len(no.valores)

        self._chaves -= 1
        # Dois filhos: copia o sucessor (menor da direita) para cá e remove o sucessor.
        if no.esquerda is not None and no.direita is not None:
            pai_suc, suc = no, no.direita
            while suc.esquerda is not None:
                pai_suc, suc = suc, suc.esquerda
            no.chave, no.valores = suc.chave, suc.valores
            pai, no = pai_suc, suc
        # Agora o nó tem no máximo um filho: o pai passa a apontar para ele.
        filho = no.esquerda if no.esquerda is not None else no.direita
        if pai is None:
            self._raiz = filho
        elif pai.esquerda is no:
            pai.esquerda = filho
        else:
            pai.direita = filho
