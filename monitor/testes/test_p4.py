"""Testes da P4: containers (com um cliente Docker falso), serviços (com um servidor
HTTP local) e as regras de alerta (transições de memória, OOM, reinício, queda)."""

import http.server
import json
import pathlib
import tempfile
import threading
import unittest

from estruturas import ListaEncadeada, TabelaHash

from monitor import eventos as ev
from monitor import servicos
from monitor.containers import MedidorDeContainers

MB = 2**20


class DockerFalso:
    """Imita as três rotas da API do Docker que o medidor usa."""

    def __init__(self):
        self.cpu_ns = 0
        self.uso = 100 * MB
        self.oom = False
        self.reinicios = 0
        self.status = "running"

    def listar(self, projeto):
        assert projeto == "origem"
        return [{"Id": "a" * 64, "Names": ["/origem-api-1"], "Labels": {"com.docker.compose.service": "api"}}]

    def inspecionar(self, id_):
        return {"Name": "/origem-api-1", "RestartCount": self.reinicios, "HostConfig": {"Memory": 256 * MB},
                "State": {"Status": self.status, "OOMKilled": self.oom, "ExitCode": 137 if self.oom else 0,
                          "StartedAt": "2026-11-24T19:00:00Z", "Health": {"Status": "healthy"}}}

    def estatisticas(self, id_):
        self.cpu_ns += 500_000_000
        return {"cpu_stats": {"cpu_usage": {"total_usage": self.cpu_ns}},
                "memory_stats": {"usage": self.uso + 20 * MB, "limit": 256 * MB, "stats": {"inactive_file": 20 * MB}}}


class TestContainers(unittest.TestCase):
    def test_memoria_desconta_cache_e_cpu_pela_diferenca(self):
        docker = DockerFalso()
        medidor = MedidorDeContainers(cliente=docker, projeto="origem")
        primeira = medidor.medir()[0]
        self.assertEqual(primeira["nome"], "api")
        self.assertEqual((primeira["memoria_uso"], primeira["memoria_limite"]), (100 * MB, 256 * MB))
        self.assertEqual(primeira["memoria_percentual"], 39.1)
        self.assertEqual(primeira["cpu"], 0.0)  # 1ª leitura não tem com o que comparar
        self.assertGreater(medidor.medir()[0]["cpu"], 0)

    def test_container_parado_nao_pede_estatisticas(self):
        docker = DockerFalso()
        docker.status = "exited"
        docker.estatisticas = lambda id_: self.fail("não deveria chamar stats de container parado")
        c = MedidorDeContainers(cliente=docker, projeto="origem").medir()[0]
        self.assertEqual((c["status"], c["cpu"], c["memoria_uso"]), ("exited", 0.0, 0))
        self.assertEqual(c["memoria_limite"], 256 * MB)  # vem do HostConfig, para a mensagem de OOM


class Respondedor(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        codigo = 200 if self.path == "/ok" else 503
        self.send_response(codigo)
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *args):
        pass


class TestServicos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Respondedor)
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.servidor.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()

    def test_lista_de_servicos(self):
        lista = servicos.lista_de_servicos("api=http://a/saude, ia=http://b ,quebrado")
        self.assertEqual([n for n, _ in lista], ["api", "ia"])

    def test_ok_erro_http_e_fora_do_ar(self):
        lista = ListaEncadeada([("bom", f"{self.base}/ok"), ("ruim", f"{self.base}/x"), ("fora", "http://127.0.0.1:1/")])
        bom, ruim, fora = servicos.medir(lista)
        self.assertTrue(bom["ok"])
        self.assertEqual(bom["status_http"], 200)
        self.assertGreater(bom["latencia_ms"], 0)
        self.assertEqual((ruim["ok"], ruim["status_http"], ruim["erro"]), (False, 503, "HTTP 503"))
        self.assertEqual((fora["ok"], fora["status_http"]), (False, None))
        self.assertTrue(fora["erro"])


def container(uso_pct=40, oom=False, reinicios=0, status="running", health="healthy"):
    c = TabelaHash()
    for k, v in (("nome", "api"), ("status", status), ("health", health), ("reinicios", reinicios), ("oom_killed", oom),
                 ("codigo_saida", 137 if oom else 0), ("memoria_limite", 100 * MB), ("memoria_uso", uso_pct * MB),
                 ("memoria_percentual", float(uso_pct))):
        c.colocar(k, v)
    return ListaEncadeada([c])


def servico(ok=True, latencia=10.0):
    s = TabelaHash()
    for k, v in (("nome", "api"), ("ok", ok), ("latencia_ms", latencia), ("erro", None if ok else "recusada")):
        s.colocar(k, v)
    return ListaEncadeada([s])


class TestAlertas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.arquivo = pathlib.Path(self.tmp.name) / "eventos.jsonl"
        self.registro = ev.RegistroDeEventos(arquivo=str(self.arquivo), guardados=50)
        self.analisador = ev.AnalisadorDeAlertas(self.registro)

    def tearDown(self):
        self.tmp.cleanup()

    def mensagens(self):
        return [(e["severidade"], e["mensagem"].split(":")[0]) for e in reversed(list(self.registro.recentes()))]

    def test_memoria_com_histerese_um_evento_por_mudanca(self):
        for pct in (40, 85, 86, 90, 96, 97, 85, 75, 72, 65, 60):
            self.analisador.containers(container(uso_pct=pct))
        self.assertEqual(self.mensagens(), [
            ("info", "container detectado (running)"),
            ("atencao", "memória alta"),      # 85: entrou em atenção (86 e 90 não repetem)
            ("critico", "memória crítica"),   # 96 (97 não repete)
            ("atencao", "memória alta"),      # 85: saiu do crítico
            ("info", "memória normalizou"),   # 65: só abaixo de 70 (75 e 72 seguram a atenção)
        ])

    def test_oom_reinicio_status_e_health(self):
        self.analisador.containers(container())
        self.analisador.containers(container(oom=True, status="exited", health="unhealthy"))
        self.analisador.containers(container(oom=True, status="exited", health="unhealthy"))  # não repete
        self.analisador.containers(container(reinicios=1))
        sev = self.mensagens()
        self.assertIn(("critico", "morto pelo OOM Killer (limite de 100 MB, código 137)"), sev)
        self.assertIn(("atencao", "status"), sev)
        self.assertIn(("atencao", "health"), sev)
        self.assertIn(("atencao", "reiniciou (total"), sev)
        self.assertEqual(sum(1 for s, m in sev if m.startswith("morto pelo OOM")), 1)

    def test_container_morto_nao_gera_memoria_normalizou(self):
        self.analisador.containers(container(uso_pct=96))
        self.analisador.containers(container(uso_pct=0, oom=True, status="exited"))
        mensagens = [m for _, m in self.mensagens()]
        self.assertIn("memória crítica", mensagens)
        self.assertNotIn("memória normalizou", mensagens)
        self.analisador.containers(container(uso_pct=96))  # voltou a rodar e encheu de novo: alerta outra vez
        self.assertEqual(sum(1 for m in (m for _, m in self.mensagens()) if m == "memória crítica"), 2)

    def test_servico_cai_volta_e_fica_lento(self):
        for ok, lat in ((True, 10), (True, 12), (False, 3000), (False, 3000), (True, 15), (True, 1500), (True, 20)):
            self.analisador.servicos(servico(ok, lat))
        self.assertEqual(self.mensagens(), [
            ("critico", "caiu (recusada)"),
            ("info", "voltou (15 ms)"),
            ("atencao", "resposta lenta"),
            ("info", "tempo de resposta normalizou"),
        ])

    def test_eventos_gravados_em_jsonl_sem_apagar(self):
        self.analisador.servicos(servico(True))
        self.analisador.servicos(servico(False))
        self.analisador.servicos(servico(True))
        linhas = self.arquivo.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(linhas), 2)
        self.assertEqual(json.loads(linhas[0])["mensagem"], "caiu (recusada)")
        self.assertEqual(self.registro.contagem()["critico"], 1)


if __name__ == "__main__":
    unittest.main()


class TestPainelRepassa(unittest.TestCase):
    def test_repassa_caminho_e_query_string_ao_coletor(self):
        import importlib
        import os

        from fastapi.testclient import TestClient

        recebidas = []

        class Coletor(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                recebidas.append(self.path)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"[]")

            def log_message(self, *args):
                pass

        servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Coletor)
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        try:
            os.environ["COLETOR_URL"] = f"http://127.0.0.1:{servidor.server_address[1]}"
            import monitor.painel_app as painel

            painel = importlib.reload(painel)
            with TestClient(painel.app) as cliente:
                self.assertEqual(cliente.get("/api/eventos?limite=7").status_code, 200)
                self.assertEqual(cliente.get("/api/nivel/hardware").status_code, 200)
            self.assertEqual(recebidas, ["/eventos?limite=7", "/nivel/hardware"])
        finally:
            servidor.shutdown()
