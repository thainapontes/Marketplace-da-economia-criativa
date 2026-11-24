"""Estruturas de dados próprias do Origem (PI 3 · AED).

Nenhuma delas usa as coleções prontas do Python (list, dict, set, deque...)
para guardar os dados: as encadeadas usam nós, e as que precisam de acesso por
índice usam o ``Vetor`` de tamanho fixo. O teste ``test_sem_colecoes_prontas``
confere isso lendo o código-fonte.
"""

from .arvore_busca import ArvoreBuscaBinaria
from .erros import ChaveNaoEncontradaError, EstruturaCheiaError, EstruturaVaziaError
from .fila import Fila
from .fila_circular import FilaCircular
from .hash import TabelaHash
from .lista import ListaEncadeada
from .pilha import Pilha
from .vetor import Vetor

__all__ = (
    "ArvoreBuscaBinaria",
    "ChaveNaoEncontradaError",
    "EstruturaCheiaError",
    "EstruturaVaziaError",
    "Fila",
    "FilaCircular",
    "ListaEncadeada",
    "Pilha",
    "TabelaHash",
    "Vetor",
)
