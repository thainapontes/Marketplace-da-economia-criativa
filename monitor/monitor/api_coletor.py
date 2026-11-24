"""API HTTP do coletor (porta 8001, só dentro da rede do Compose).

As threads do coletor sobem junto com o servidor e param com ele. O painel
consulta estas rotas; nenhuma delas mede nada na hora: todas leem o Estado
que a thread consumidora mantém atualizado.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .coletor import Coletor
from .serializar import para_json

coletor = Coletor()


@asynccontextmanager
async def ciclo_de_vida(_app):
    coletor.iniciar()
    yield
    coletor.parar()


app = FastAPI(title="Coletor do Origem", lifespan=ciclo_de_vida)


@app.get("/saude")
def saude():
    vivas = all(viva for _, viva in coletor.situacao()["threads"].itens())
    if not vivas:
        raise HTTPException(503, "alguma thread do coletor parou")
    return {"ok": True}


@app.get("/coletor")
def situacao_do_coletor():
    return para_json(coletor.situacao())


@app.get("/eventos")
def eventos(limite: int = 100):
    return para_json(coletor.eventos.recentes(max(1, min(limite, 500))))


@app.get("/nivel/{nivel}")
def nivel(nivel: str):
    ultimo = coletor.estado.ultimo(nivel)
    if ultimo is None:
        raise HTTPException(404, f"ainda não há amostras de '{nivel}'")
    return {"ultimo": para_json(ultimo), "historico": para_json(coletor.estado.historico(nivel))}
