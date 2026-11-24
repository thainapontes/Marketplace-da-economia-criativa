"""A FilaCircular sob várias threads: nenhum item se perde nem se repete.

É o cenário do coletor do monitor: várias threads produtoras e consumidoras
disputando uma fila pequena, que enche e esvazia o tempo todo.
"""

import threading
import unittest

from estruturas import EstruturaVaziaError, FilaCircular

PRODUTORES = 4
CONSUMIDORES = 3
ITENS_POR_PRODUTOR = 5000


class TestFilaCircularConcorrente(unittest.TestCase):
    def test_produtores_e_consumidores_sem_perda_nem_duplicacao(self):
        fila = FilaCircular(8)  # bem menor que o total: força espera dos dois lados
        recebidos = [[] for _ in range(CONSUMIDORES)]
        fim = threading.Event()

        def produtor(p):
            for i in range(ITENS_POR_PRODUTOR):
                fila.colocar((p, i), timeout=10)

        def consumidor(c):
            while True:
                try:
                    recebidos[c].append(fila.retirar(timeout=0.05))
                except EstruturaVaziaError:
                    if fim.is_set() and fila.vazia():
                        return

        threads_c = [threading.Thread(target=consumidor, args=(c,)) for c in range(CONSUMIDORES)]
        threads_p = [threading.Thread(target=produtor, args=(p,)) for p in range(PRODUTORES)]
        for t in threads_c + threads_p:
            t.start()
        for t in threads_p:
            t.join(timeout=30)
        fim.set()
        for t in threads_c:
            t.join(timeout=30)

        todos = [item for lista in recebidos for item in lista]
        esperado = {(p, i) for p in range(PRODUTORES) for i in range(ITENS_POR_PRODUTOR)}
        self.assertEqual(len(todos), PRODUTORES * ITENS_POR_PRODUTOR, "item perdido ou duplicado")
        self.assertEqual(set(todos), esperado)
        # Cada consumidor recebe os itens de um mesmo produtor na ordem em que foram produzidos (FIFO).
        for lista in recebidos:
            ultimo = {}
            for p, i in lista:
                self.assertGreater(i, ultimo.get(p, -1))
                ultimo[p] = i

    def test_colocar_descartando_concorrente_mantem_contagem_coerente(self):
        fila = FilaCircular(16)
        total = 4 * 3000

        def produtor():
            for i in range(3000):
                fila.colocar_descartando(i)

        threads = [threading.Thread(target=produtor) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        # Tudo o que entrou ou ainda está na fila ou foi contado como descartado.
        self.assertEqual(len(fila) + fila.descartados, total)
        self.assertEqual(len(fila), 16)

    def test_consumidor_bloqueado_acorda_quando_chega_item(self):
        fila = FilaCircular(2)
        resultado = []
        t = threading.Thread(target=lambda: resultado.append(fila.retirar(timeout=5)))
        t.start()
        fila.colocar("amostra")
        t.join(timeout=5)
        self.assertEqual(resultado, ["amostra"])


if __name__ == "__main__":
    unittest.main()
