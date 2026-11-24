"""Cliente mínimo da API do Docker por socket Unix, só com a biblioteca padrão.

Funciona com o Docker e com o Podman (que implementa a mesma API). O socket
do host é montado no coletor em /var/run/docker.sock (ver compose.yaml).
São só três chamadas, todas de leitura:
    GET /containers/json?all=1     lista (inclusive os parados)
    GET /containers/{id}/json      detalhes: estado, health, reinícios, OOMKilled
    GET /containers/{id}/stats     uso de CPU e memória, uma leitura (stream=false)
"""

import http.client
import json
import os
import socket
import urllib.parse

SOCKET = os.environ.get("SOCKET_DOCKER", "/var/run/docker.sock")


class _ConexaoUnix(http.client.HTTPConnection):
    def __init__(self, caminho: str, timeout: float):
        super().__init__("localhost", timeout=timeout)
        self._caminho = caminho

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self._caminho)


class ErroDocker(RuntimeError):
    pass


class ClienteDocker:
    def __init__(self, caminho: str = SOCKET, timeout: float = 5):
        self.caminho = caminho
        self.timeout = timeout

    def _get(self, rota: str):
        conexao = _ConexaoUnix(self.caminho, self.timeout)
        try:
            conexao.request("GET", rota)
            resposta = conexao.getresponse()
            corpo = resposta.read()
        except OSError as erro:
            raise ErroDocker(f"sem acesso ao socket {self.caminho}: {erro}") from erro
        finally:
            conexao.close()
        if resposta.status != 200:
            raise ErroDocker(f"GET {rota}: HTTP {resposta.status}")
        return json.loads(corpo)

    def listar(self, projeto: str):
        filtro = json.dumps({"label": [f"com.docker.compose.project={projeto}"]})
        return self._get(f"/containers/json?all=1&filters={urllib.parse.quote(filtro)}")

    def inspecionar(self, id_: str):
        return self._get(f"/containers/{id_}/json")

    def estatisticas(self, id_: str):
        return self._get(f"/containers/{id_}/stats?stream=false")
