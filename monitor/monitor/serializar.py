"""Converte as estruturas próprias em tipos que o JSON entende, só na saída da API.

Dentro do coletor tudo é TabelaHash e ListaEncadeada; o JSON da resposta HTTP
precisa de dict e list. A conversão acontece aqui, na borda, e em nenhum outro lugar.
"""

from estruturas import ListaEncadeada, TabelaHash


def para_json(valor):
    if isinstance(valor, TabelaHash):
        return {str(chave): para_json(v) for chave, v in valor.itens()}
    if isinstance(valor, ListaEncadeada):
        return [para_json(v) for v in valor]
    if isinstance(valor, tuple):
        return [para_json(v) for v in valor]
    return valor
