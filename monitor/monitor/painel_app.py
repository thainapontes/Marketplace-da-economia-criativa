"""Painel web (porta 8080): serve as telas e repassa /api/* para o coletor.

O navegador só conversa com o painel; o painel busca os dados na API do
coletor pela rede interna do Compose (COLETOR_URL).
"""

import os
import pathlib
import urllib.error
import urllib.request

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles

COLETOR_URL = os.environ.get("COLETOR_URL", "http://coletor:8001").rstrip("/")
ESTATICOS = pathlib.Path(__file__).resolve().parent / "painel"

app = FastAPI(title="Painel do Origem")


@app.get("/saude")
def saude():
    return {"ok": True}


@app.get("/api/{caminho:path}")
def repassar(caminho: str):
    try:
        with urllib.request.urlopen(f"{COLETOR_URL}/{caminho}", timeout=3) as r:
            return Response(r.read(), status_code=r.status, media_type="application/json")
    except urllib.error.HTTPError as erro:
        return Response(erro.read(), status_code=erro.code, media_type="application/json")
    except OSError as erro:
        return Response(f'{{"detail": "coletor indisponível: {erro}"}}', status_code=502, media_type="application/json")


app.mount("/", StaticFiles(directory=ESTATICOS, html=True), name="painel")
