"""Medição do nível 3 do painel: health check e tempo de resposta de cada serviço.

A lista vem de SERVICOS, no formato ``nome=url,nome=url``. Cada serviço recebe
um GET; "ok" é responder 2xx dentro do tempo limite. O tempo de resposta é
medido do envio até o fim da leitura do corpo.
"""

import os
import time
import urllib.error
import urllib.request

from estruturas import ListaEncadeada, TabelaHash

PADRAO = "api=http://api:3333/saude,ia=http://ia:3001/healthz,frontend=http://frontend:3000/,painel=http://painel:8080/saude"
TIMEOUT_S = float(os.environ.get("TIMEOUT_SERVICOS", 3))


def lista_de_servicos(texto: str | None = None) -> ListaEncadeada:
    servicos = ListaEncadeada()
    for item in (texto if texto is not None else os.environ.get("SERVICOS", PADRAO)).split(","):
        nome, _, url = item.strip().partition("=")
        if nome and url:
            servicos.inserir_fim((nome.strip(), url.strip()))
    return servicos


def verificar(nome: str, url: str) -> TabelaHash:
    r = TabelaHash()
    r.colocar("nome", nome)
    r.colocar("url", url)
    inicio = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_S) as resposta:
            resposta.read()
            r.colocar("status_http", resposta.status)
            r.colocar("ok", 200 <= resposta.status < 300)
            r.colocar("erro", None)
    except urllib.error.HTTPError as erro:
        r.colocar("status_http", erro.code)
        r.colocar("ok", False)
        r.colocar("erro", f"HTTP {erro.code}")
    except OSError as erro:  # recusa de conexão, DNS, tempo esgotado
        r.colocar("status_http", None)
        r.colocar("ok", False)
        r.colocar("erro", str(getattr(erro, "reason", erro)))
    r.colocar("latencia_ms", round((time.perf_counter() - inicio) * 1000, 1))
    return r


def medir(servicos: ListaEncadeada | None = None) -> ListaEncadeada:
    resultado = ListaEncadeada()
    for nome, url in servicos if servicos is not None else lista_de_servicos():
        resultado.inserir_fim(verificar(nome, url))
    return resultado
