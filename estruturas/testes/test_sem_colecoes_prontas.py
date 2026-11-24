"""Confere, lendo o código-fonte, que as estruturas não usam coleções prontas.

Regra do PI 3 (AED): "não usar as coleções prontas da linguagem nas partes
avaliadas". O teste percorre a árvore sintática (AST) de cada módulo de
``estruturas/`` e falha se encontrar:
- literais ou compreensões de list, dict e set: ``[...]``, ``{...}``, ``[x for ...]``;
- chamadas a list(), dict(), set(), frozenset(), sorted(), reversed();
- métodos de ordenação e busca prontos: ``.sort()``, ``.index()``;
- imports de collections, heapq, bisect, queue e array.

Tuplas são permitidas: são registros imutáveis (como ``__slots__`` ou o par
chave/valor que ``itens()`` devolve), não um lugar onde a estrutura guarda dados.
"""

import ast
import pathlib
import unittest

PASTA = pathlib.Path(__file__).resolve().parent.parent / "estruturas"
NOS_PROIBIDOS = (ast.List, ast.Dict, ast.Set, ast.ListComp, ast.DictComp, ast.SetComp)
CHAMADAS_PROIBIDAS = {"list", "dict", "set", "frozenset", "sorted", "reversed"}
METODOS_PROIBIDOS = {"sort", "index"}
MODULOS_PROIBIDOS = {"collections", "heapq", "bisect", "queue", "array"}


def violacoes(caminho: pathlib.Path):
    arvore = ast.parse(caminho.read_text(encoding="utf-8"), filename=str(caminho))
    for no in ast.walk(arvore):
        onde = f"{caminho.name}:{getattr(no, 'lineno', '?')}"
        if isinstance(no, NOS_PROIBIDOS):
            yield f"{onde} {type(no).__name__}"
        elif isinstance(no, ast.Call):
            if isinstance(no.func, ast.Name) and no.func.id in CHAMADAS_PROIBIDAS:
                yield f"{onde} chamada a {no.func.id}()"
            if isinstance(no.func, ast.Attribute) and no.func.attr in METODOS_PROIBIDOS:
                yield f"{onde} método .{no.func.attr}()"
        elif isinstance(no, ast.Import):
            for nome in no.names:
                if nome.name.split(".")[0] in MODULOS_PROIBIDOS:
                    yield f"{onde} import {nome.name}"
        elif isinstance(no, ast.ImportFrom) and (no.module or "").split(".")[0] in MODULOS_PROIBIDOS:
            yield f"{onde} from {no.module} import ..."


class TestSemColecoesProntas(unittest.TestCase):
    def test_nenhum_modulo_usa_colecoes_prontas(self):
        arquivos = sorted(PASTA.glob("*.py"))
        self.assertGreater(len(arquivos), 5)
        encontradas = [v for arquivo in arquivos for v in violacoes(arquivo)]
        self.assertEqual(encontradas, [], "coleções prontas encontradas:\n" + "\n".join(encontradas))

    def test_o_verificador_pega_uma_violacao_de_proposito(self):
        # Sabotagem: garante que o teste acima é capaz de falhar.
        falso = PASTA.parent / "testes" / "_sabotagem_tmp.py"
        falso.write_text("import collections\nx = [1, 2]\ny = sorted(x)\nx.sort()\n", encoding="utf-8")
        try:
            self.assertEqual(len(list(violacoes(falso))), 4)
        finally:
            falso.unlink()


if __name__ == "__main__":
    unittest.main()
