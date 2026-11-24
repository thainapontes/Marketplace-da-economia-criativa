"""Vetor de tamanho fixo, a base das estruturas que precisam de acesso por índice.

Em Python não existe um "array cru" de objetos: a lista nativa já é uma estrutura
pronta, que cresce sozinha e tem append, insert e fatiamento. Para não usá-la, o
Vetor reserva um bloco contíguo de referências com ``ctypes`` — um array C de
``PyObject*`` de tamanho fixo. Ele só sabe ler e gravar uma posição; crescer,
deslocar e procurar são responsabilidade de quem usa (FilaCircular, TabelaHash).
"""

import ctypes


class Vetor:
    """Bloco fixo de ``capacidade`` posições, todas começando com ``None``.

    Ler ou gravar uma posição é O(1). Não cresce: para "aumentar", cria-se outro
    Vetor e copia-se elemento por elemento (ver TabelaHash._redimensionar).
    """

    __slots__ = ("_dados", "_capacidade")

    def __init__(self, capacidade: int):
        if not isinstance(capacidade, int) or capacidade <= 0:
            raise ValueError("a capacidade do vetor deve ser um inteiro positivo")
        self._capacidade = capacidade
        self._dados = (ctypes.py_object * capacidade)()
        i = 0
        while i < capacidade:  # posições do array C nascem vazias (NULL)
            self._dados[i] = None
            i += 1

    @property
    def capacidade(self) -> int:
        return self._capacidade

    def _conferir(self, indice: int) -> None:
        if not isinstance(indice, int) or not 0 <= indice < self._capacidade:
            raise IndexError(f"índice {indice} fora do vetor de capacidade {self._capacidade}")

    def __getitem__(self, indice: int):
        self._conferir(indice)
        return self._dados[indice]

    def __setitem__(self, indice: int, valor) -> None:
        self._conferir(indice)
        self._dados[indice] = valor

    def __len__(self) -> int:
        return self._capacidade
