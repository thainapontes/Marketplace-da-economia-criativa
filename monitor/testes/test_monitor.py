"""Testes do coletor com um /proc falso: números previsíveis e sem depender da máquina.

Rodar: uv run python -m unittest discover -s testes -v
"""

import importlib
import os
import pathlib
import tempfile
import time
import unittest

from estruturas import ListaEncadeada, TabelaHash

STAT_1 = "cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 50 0 50 350 50 0 0 0 0 0\ncpu1 50 0 50 350 50 0 0 0 0 0\nintr 1\n"
# +100 ocupado e +100 ocioso no total → 50%; cpu0 só ocupado → 100%; cpu1 só ocioso → 0%
STAT_2 = "cpu  200 0 100 800 100 0 0 0 0 0\ncpu0 100 0 100 350 50 0 0 0 0 0\ncpu1 50 0 50 400 100 0 0 0 0 0\nintr 1\n"
MEMINFO = "MemTotal: 1000 kB\nMemFree: 100 kB\nMemAvailable: 250 kB\nBuffers: 10 kB\nCached: 90 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n"


def montar_proc(pasta: pathlib.Path, stat: str) -> None:
    (pasta / "stat").write_text(stat)
    (pasta / "meminfo").write_text(MEMINFO)
    (pasta / "loadavg").write_text("0.50 0.25 0.10 1/100 999\n")
    (pasta / "uptime").write_text("3725.4 100.0\n")
    for pid, estado, threads in ((1, "S (sleeping)", 1), (42, "R (running)", 7), (43, "Z (zombie)", 1)):
        (pasta / str(pid)).mkdir(exist_ok=True)
        (pasta / str(pid) / "status").write_text(f"Name:\tx\nState:\t{estado}\nThreads:\t{threads}\n")
    (pasta / "self").mkdir(exist_ok=True)  # não numérico: não conta como processo
    raiz = pasta.parent / "raiz"
    (raiz / "var").mkdir(parents=True, exist_ok=True)
    (pasta / "1" / "mounts").write_text(
        f"composefs / overlay ro 0 0\n"
        f"/dev/sda3 /etc btrfs rw 0 0\n"
        f"/dev/sda3 /var btrfs rw 0 0\n"
        f"proc /proc proc rw 0 0\n"
    )


class ComProcFalso(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = pathlib.Path(self.tmp.name)
        self.proc_dir = base / "proc"
        self.proc_dir.mkdir()
        montar_proc(self.proc_dir, STAT_1)
        os.environ["PROC"] = str(self.proc_dir)
        os.environ["RAIZ"] = str(base / "raiz")
        os.environ["INTERVALO_HARDWARE"] = "0.05"
        os.environ["HISTORICO"] = "5"
        os.environ["BUFFER"] = "4"
        os.environ["MONITORAR_CONTAINERS"] = "0"  # têm testes próprios em test_p4.py
        os.environ["MONITORAR_SERVICOS"] = "0"
        import monitor.proc
        import monitor.coletor
        self.proc = importlib.reload(monitor.proc)
        self.coletor_mod = importlib.reload(monitor.coletor)

    def tearDown(self):
        self.tmp.cleanup()


class TestProc(ComProcFalso):
    def test_uso_de_cpu_pela_diferenca_entre_leituras(self):
        antes = self.proc.tempos_de_cpu()
        (self.proc_dir / "stat").write_text(STAT_2)
        uso = self.proc.uso_de_cpu(antes, self.proc.tempos_de_cpu())
        self.assertEqual((uso["cpu"], uso["cpu0"], uso["cpu1"]), (50.0, 100.0, 0.0))

    def test_memoria_usada_e_total_menos_disponivel(self):
        m = self.proc.memoria()
        self.assertEqual((m["total"], m["usada"], m["percentual"], m["cache"]), (1024000, 768000, 75.0, 102400))

    def test_processos_threads_e_estados(self):
        p = self.proc.processos_e_threads()
        self.assertEqual((p["processos"], p["threads"]), (3, 9))
        self.assertEqual((p["estados"]["S"], p["estados"]["R"], p["estados"]["Z"]), (1, 1, 1))

    def test_discos_um_por_dispositivo_no_ponto_mais_representativo(self):
        discos = self.proc.discos()
        self.assertEqual(len(discos), 1)  # composefs e proc não são /dev; /dev/sda3 aparece uma vez só
        self.assertEqual((discos[0]["dispositivo"], discos[0]["montagem"]), ("/dev/sda3", "/var"))

    def test_amostra_completa(self):
        a, _ = self.proc.amostra_de_hardware(self.proc.tempos_de_cpu())
        self.assertIsInstance(a, TabelaHash)
        self.assertIsInstance(a["cpu_nucleos"], ListaEncadeada)
        self.assertEqual(len(a["cpu_nucleos"]), 2)
        self.assertEqual(a["sistema"]["ligado_ha_s"], 3725)


class TestColetor(ComProcFalso):
    def test_threads_produzem_e_consumidor_registra_com_historico_limitado(self):
        coletor = self.coletor_mod.Coletor()
        coletor.iniciar()
        try:
            limite = time.monotonic() + 5
            while coletor.estado.recebidas("hardware") < 8 and time.monotonic() < limite:
                time.sleep(0.05)
            s = coletor.situacao()
            self.assertTrue(s["threads"]["hardware"] and s["threads"]["consumidor"])
            self.assertGreaterEqual(coletor.estado.recebidas("hardware"), 8)
            self.assertEqual(len(coletor.estado.historico("hardware")), 5)  # HISTORICO=5: só as últimas
            self.assertIsNotNone(coletor.estado.ultimo("hardware"))
            self.assertEqual(s["erros_de_medicao"], 0)
        finally:
            coletor.parar()
        self.assertFalse(any(viva for _, viva in coletor.situacao()["threads"].itens()))

    def test_medicao_que_falha_nao_mata_a_thread(self):
        coletor = self.coletor_mod.Coletor()
        (self.proc_dir / "meminfo").unlink()  # a próxima medição vai falhar
        coletor.iniciar()
        try:
            limite = time.monotonic() + 5
            while coletor.situacao()["erros_de_medicao"] < 2 and time.monotonic() < limite:
                time.sleep(0.05)
            self.assertGreaterEqual(coletor.situacao()["erros_de_medicao"], 2)
            self.assertTrue(coletor.situacao()["threads"]["hardware"])  # continua viva
            (self.proc_dir / "meminfo").write_text(MEMINFO)  # volta a funcionar sozinha
            antes = coletor.estado.recebidas("hardware")
            limite = time.monotonic() + 5
            while coletor.estado.recebidas("hardware") == antes and time.monotonic() < limite:
                time.sleep(0.05)
            self.assertGreater(coletor.estado.recebidas("hardware"), antes)
        finally:
            coletor.parar()

    def test_api_do_coletor(self):
        from fastapi.testclient import TestClient
        import monitor.api_coletor as api

        api = importlib.reload(api)
        with TestClient(api.app) as cliente:
            limite = time.monotonic() + 5
            while cliente.get("/nivel/hardware").status_code == 404 and time.monotonic() < limite:
                time.sleep(0.05)
            r = cliente.get("/nivel/hardware")
            self.assertEqual(r.status_code, 200)
            corpo = r.json()
            self.assertEqual(corpo["ultimo"]["memoria"]["percentual"], 75.0)
            self.assertIsInstance(corpo["historico"], list)
            self.assertEqual(cliente.get("/saude").json(), {"ok": True})
            self.assertEqual(cliente.get("/nivel/inexistente").status_code, 404)


if __name__ == "__main__":
    unittest.main()
