"""Testes de inserir, remover e consultar de cada estrutura, com os casos de borda.

Os testes podem usar list e dict do Python para montar o esperado: a regra de
"sem coleções prontas" vale para as estruturas, não para quem as testa.
Rodar: uv run python -m unittest discover -s testes -v
"""

import random
import unittest

from estruturas import (
    ArvoreBuscaBinaria,
    ChaveNaoEncontradaError,
    EstruturaCheiaError,
    EstruturaVaziaError,
    Fila,
    FilaCircular,
    ListaEncadeada,
    Pilha,
    TabelaHash,
    Vetor,
)


class TestVetor(unittest.TestCase):
    def test_nasce_com_none_e_grava_por_indice(self):
        v = Vetor(3)
        self.assertEqual([v[0], v[1], v[2]], [None, None, None])
        v[1] = "x"
        self.assertEqual(v[1], "x")
        self.assertEqual(len(v), 3)

    def test_fora_dos_limites_e_capacidade_invalida(self):
        v = Vetor(2)
        for indice in (-1, 2, 99):
            with self.assertRaises(IndexError):
                v[indice]
        for capacidade in (0, -3, 2.5):
            with self.assertRaises(ValueError):
                Vetor(capacidade)


class TestListaEncadeada(unittest.TestCase):
    def test_inserir_nas_pontas_e_no_meio(self):
        lista = ListaEncadeada()
        lista.inserir_fim(2)
        lista.inserir_inicio(1)
        lista.inserir_fim(4)
        lista.inserir_em(2, 3)
        lista.inserir_em(4, 5)  # posição == tamanho: vai para o fim
        self.assertEqual(list(lista), [1, 2, 3, 4, 5])
        self.assertEqual(list(lista.reverso()), [5, 4, 3, 2, 1])
        self.assertEqual((lista.primeiro(), lista.ultimo(), len(lista)), (1, 5, 5))

    def test_obter_pelos_dois_lados(self):
        lista = ListaEncadeada(range(10))
        self.assertEqual([lista[i] for i in range(10)], list(range(10)))
        with self.assertRaises(IndexError):
            lista.obter(10)

    def test_remover(self):
        lista = ListaEncadeada([1, 2, 3, 2, 4])
        self.assertTrue(lista.remover(2))  # só a primeira ocorrência
        self.assertEqual(list(lista), [1, 3, 2, 4])
        self.assertFalse(lista.remover(99))
        self.assertEqual(lista.remover_inicio(), 1)
        self.assertEqual(lista.remover_fim(), 4)
        self.assertEqual(lista.remover_em(1), 2)
        self.assertEqual(list(lista), [3])
        self.assertEqual(lista.remover_inicio(), 3)
        self.assertTrue(lista.vazia())
        for operacao in (lista.remover_inicio, lista.remover_fim, lista.primeiro, lista.ultimo):
            with self.assertRaises(EstruturaVaziaError):
                operacao()

    def test_remover_se_e_lista_consistente_depois(self):
        lista = ListaEncadeada(range(10))
        self.assertEqual(lista.remover_se(lambda x: x % 2 == 0), 5)
        self.assertEqual(list(lista), [1, 3, 5, 7, 9])
        self.assertEqual(list(lista.reverso()), [9, 7, 5, 3, 1])
        lista.inserir_fim(11)
        self.assertEqual(lista.ultimo(), 11)

    def test_buscar_e_contem(self):
        produtos = ListaEncadeada([{"id": 1, "estoque": 0}, {"id": 2, "estoque": 5}])
        self.assertEqual(produtos.buscar(lambda p: p["estoque"] > 0)["id"], 2)
        self.assertIsNone(produtos.buscar(lambda p: p["id"] == 99))
        self.assertIn(2, ListaEncadeada([1, 2]))
        self.assertEqual(ListaEncadeada([5, 6]).indice_de(6), 1)
        self.assertEqual(ListaEncadeada([5, 6]).indice_de(7), -1)

    def test_inserir_ordenado_e_estavel(self):
        lista = ListaEncadeada()
        for nome, prioridade in [("a", 2), ("b", 1), ("c", 2), ("d", 3), ("e", 1)]:
            lista.inserir_ordenado((nome, prioridade), chave=lambda p: p[1])
        self.assertEqual([n for n, _ in lista], ["b", "e", "a", "c", "d"])
        decrescente = ListaEncadeada()
        for valor in [3, 1, 4, 1, 5]:
            decrescente.inserir_ordenado(valor, decrescente=True)
        self.assertEqual(list(decrescente), [5, 4, 3, 1, 1])

    def test_limpar(self):
        lista = ListaEncadeada([1, 2])
        lista.limpar()
        self.assertEqual((len(lista), list(lista)), (0, []))


class TestPilha(unittest.TestCase):
    def test_lifo(self):
        pilha = Pilha()
        for operacao in ["baixa 1", "baixa 2", "reposição"]:
            pilha.empilhar(operacao)
        self.assertEqual(pilha.topo(), "reposição")
        self.assertEqual(list(pilha), ["reposição", "baixa 2", "baixa 1"])
        self.assertEqual([pilha.desempilhar() for _ in range(3)], ["reposição", "baixa 2", "baixa 1"])
        self.assertTrue(pilha.vazia())

    def test_vazia(self):
        with self.assertRaises(EstruturaVaziaError):
            Pilha().desempilhar()
        with self.assertRaises(EstruturaVaziaError):
            Pilha().topo()


class TestFila(unittest.TestCase):
    def test_fifo_e_reuso_depois_de_esvaziar(self):
        fila = Fila()
        for pedido in ["PE-1", "PE-2", "PE-3"]:
            fila.enfileirar(pedido)
        self.assertEqual(fila.frente(), "PE-1")
        self.assertEqual(fila.desenfileirar(), "PE-1")
        self.assertEqual(list(fila), ["PE-2", "PE-3"])
        fila.desenfileirar()
        fila.desenfileirar()
        self.assertTrue(fila.vazia())
        fila.enfileirar("PE-4")  # o ponteiro do fim foi zerado corretamente
        self.assertEqual((fila.frente(), len(fila)), ("PE-4", 1))

    def test_vazia(self):
        with self.assertRaises(EstruturaVaziaError):
            Fila().desenfileirar()
        with self.assertRaises(EstruturaVaziaError):
            Fila().frente()


class TestFilaCircular(unittest.TestCase):
    def test_da_a_volta_no_vetor(self):
        fila = FilaCircular(3)
        for i in range(3):
            fila.colocar(i)
        self.assertTrue(fila.cheia())
        self.assertEqual(fila.retirar(), 0)
        fila.colocar(3)  # grava na posição 0, depois do fim do vetor
        self.assertEqual(list(fila.instantaneo()), [1, 2, 3])
        self.assertEqual([fila.retirar() for _ in range(3)], [1, 2, 3])
        self.assertTrue(fila.vazia())

    def test_cheia_e_vazia_sem_bloquear_e_com_timeout(self):
        fila = FilaCircular(1)
        with self.assertRaises(EstruturaVaziaError):
            fila.retirar(bloquear=False)
        with self.assertRaises(EstruturaVaziaError):
            fila.retirar(timeout=0.05)
        fila.colocar("a")
        with self.assertRaises(EstruturaCheiaError):
            fila.colocar("b", bloquear=False)
        with self.assertRaises(EstruturaCheiaError):
            fila.colocar("b", timeout=0.05)
        self.assertEqual(fila.espiar(), "a")

    def test_colocar_descartando_sobrescreve_o_mais_antigo(self):
        fila = FilaCircular(3)
        self.assertIsNone(fila.colocar_descartando(1))
        fila.colocar_descartando(2)
        fila.colocar_descartando(3)
        self.assertEqual(fila.colocar_descartando(4), 1)
        self.assertEqual(fila.colocar_descartando(5), 2)
        self.assertEqual(list(fila.instantaneo()), [3, 4, 5])
        self.assertEqual((len(fila), fila.descartados), (3, 2))


class TestTabelaHash(unittest.TestCase):
    def test_colocar_obter_substituir_remover(self):
        tabela = TabelaHash()
        tabela.colocar(10, "Vaso de barro")
        tabela[11] = "Renda renascença"
        tabela.colocar(10, "Vaso de barro grande")  # mesma chave: substitui
        self.assertEqual((len(tabela), tabela[10], tabela.obter(11)), (2, "Vaso de barro grande", "Renda renascença"))
        self.assertIn(11, tabela)
        self.assertEqual(tabela.remover(11), "Renda renascença")
        self.assertNotIn(11, tabela)
        self.assertEqual(len(tabela), 1)

    def test_chave_inexistente(self):
        tabela = TabelaHash()
        with self.assertRaises(ChaveNaoEncontradaError):
            tabela.obter(1)
        with self.assertRaises(ChaveNaoEncontradaError):
            tabela.remover(1)
        self.assertEqual(tabela.obter(1, None), None)

    def test_colisoes_no_mesmo_balde(self):
        tabela = TabelaHash(capacidade_inicial=4)
        # Com 4 baldes, 1, 5 e 9 caem todos no balde 1: ficam encadeados.
        for chave in (1, 5, 9):
            tabela.colocar(chave, chave * 10)
        self.assertEqual(tabela.remover(5), 50)  # remove do meio da corrente
        self.assertEqual((tabela[1], tabela[9]), (10, 90))

    def test_cresce_e_nao_perde_nada(self):
        tabela = TabelaHash(capacidade_inicial=4)
        esperado = {}
        for i in range(1000):
            tabela.colocar(f"produto-{i}", i)
            esperado[f"produto-{i}"] = i
        self.assertEqual(len(tabela), 1000)
        self.assertLessEqual(tabela.fator_de_carga, TabelaHash.FATOR_MAXIMO)
        self.assertEqual(dict(tabela.itens()), esperado)
        self.assertEqual(sorted(tabela.chaves()), sorted(esperado))


class TestArvoreBuscaBinaria(unittest.TestCase):
    def montar(self):
        arvore = ArvoreBuscaBinaria()
        for preco, produto in [(150, "vaso"), (80, "fita"), (300, "renda"), (80, "colar"), (220, "bolsa"), (40, "imã")]:
            arvore.inserir(preco, produto)
        return arvore

    def test_busca_exata_com_chaves_repetidas(self):
        arvore = self.montar()
        self.assertEqual(list(arvore.buscar(80)), ["fita", "colar"])
        self.assertEqual(list(arvore.buscar(999)), [])
        self.assertIn(220, arvore)
        self.assertEqual((len(arvore), arvore.quantidade_de_chaves), (6, 5))

    def test_minimo_maximo_e_em_ordem(self):
        arvore = self.montar()
        self.assertEqual((arvore.minimo(), arvore.maximo()), (40, 300))
        self.assertEqual([c for c, _ in arvore.em_ordem()], [40, 80, 80, 150, 220, 300])

    def test_intervalo_de_preco(self):
        arvore = self.montar()
        self.assertEqual(list(arvore.intervalo(80, 220)), ["fita", "colar", "vaso", "bolsa"])
        self.assertEqual(list(arvore.intervalo(0, 39)), [])
        self.assertEqual(list(arvore.intervalo(301, 999)), [])
        self.assertEqual(list(arvore.intervalo(300, 300)), ["renda"])

    def test_remover_folha_um_filho_dois_filhos_e_raiz(self):
        arvore = self.montar()
        arvore.remover(40)          # folha
        arvore.remover(300)         # nó com um filho (220)
        arvore.remover(150)         # raiz com dois filhos
        self.assertEqual([c for c, _ in arvore.em_ordem()], [80, 80, 220])
        arvore.remover(80, "fita")  # só um dos valores da chave
        self.assertEqual(list(arvore.buscar(80)), ["colar"])
        self.assertEqual(len(arvore), 2)
        with self.assertRaises(ChaveNaoEncontradaError):
            arvore.remover(999)
        with self.assertRaises(ChaveNaoEncontradaError):
            arvore.remover(80, "inexistente")

    def test_vazia(self):
        arvore = ArvoreBuscaBinaria()
        self.assertEqual((arvore.altura(), len(arvore), list(arvore.intervalo(0, 10))), (0, 0, []))
        with self.assertRaises(EstruturaVaziaError):
            arvore.minimo()

    def test_aleatoria_confere_com_ordenacao_e_altura(self):
        rng = random.Random(42)
        chaves = [rng.randint(0, 10_000) for _ in range(2000)]
        arvore = ArvoreBuscaBinaria()
        for c in chaves:
            arvore.inserir(c, c)
        self.assertEqual([c for c, _ in arvore.em_ordem()], sorted(chaves))
        self.assertEqual(list(arvore.intervalo(2000, 4000)), sorted(c for c in chaves if 2000 <= c <= 4000))
        self.assertLess(arvore.altura(), 40)  # ≈ 2·log2(2000) ≈ 22 em média; bem longe de n

    def test_pior_caso_chaves_ordenadas_vira_lista_sem_estourar_recursao(self):
        arvore = ArvoreBuscaBinaria()
        for c in range(5000):  # recursão pura estouraria o limite do Python (1000)
            arvore.inserir(c, c)
        self.assertEqual(arvore.altura(), 5000)
        self.assertEqual(list(arvore.buscar(4999)), [4999])
        self.assertEqual(len(arvore.intervalo(10, 19)), 10)


if __name__ == "__main__":
    unittest.main()
