"""Erros das estruturas, para quem usa distinguir "vazia" e "cheia" de outros erros."""


class EstruturaVaziaError(LookupError):
    """Tentativa de retirar ou consultar um elemento de uma estrutura vazia."""


class EstruturaCheiaError(OverflowError):
    """Tentativa de colocar um elemento numa estrutura de capacidade fixa já cheia."""


class ChaveNaoEncontradaError(KeyError):
    """A chave procurada não existe na estrutura."""
