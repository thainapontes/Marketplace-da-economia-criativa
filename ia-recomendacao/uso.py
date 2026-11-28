"""Log de uso dos dados: uma linha por chamada, sem nunca apagar as anteriores.

Cada função de acesso de dados.py (e cada recomendação, sentimento ou
classificação do serviço) passa pelo decorador `@registrado`, que acrescenta
uma linha JSON em logs/uso_dados.jsonl com:

  data_hora     quando foi chamada (hora local, com fuso)
  funcao        o nome da função
  quem_chamou   backend, frontend, teste, script ou api (ver CHAMADORES)
  rota          a rota HTTP (ex.: GET /api/produtos/{produto_id}/recomendados)
                ou o script que fez a chamada (ex.: lote.py)
  parametros    os argumentos, só ids e números (nada de nome, e-mail ou texto livre)
  fonte         de onde vieram os dados: banco ou retrato (o JSON de reserva)
  resultado     sucesso, nao-encontrado ou erro
  registros     quantos registros voltaram
  ids           quais registros voltaram (fica de fora nas leituras em massa,
                como listar_produtos, que devolvem a tabela inteira)
  erro          tipo e motivo, só quando resultado = erro
  duracao_ms    quanto tempo levou

O log é "best-effort": se o disco falhar, a chamada segue normalmente.
O resumo do log fica em resumo.py.
"""

from __future__ import annotations

import functools
import json
import os
import sys
import threading
import time
from contextvars import ContextVar
from datetime import datetime
from pathlib import Path

ARQUIVO = Path(os.environ.get("USO_LOG", Path(__file__).resolve().parent / "logs" / "uso_dados.jsonl"))

# Quem pode aparecer em "quem_chamou". O serviço HTTP lê o header X-Origem-Chamador;
# um script define pela variável de ambiente ORIGEM_CHAMADOR. Valor fora da lista vira "api".
CHAMADORES = {"backend", "frontend", "teste", "script", "api", "lote", "resumo"}

_padrao = os.environ.get("ORIGEM_CHAMADOR", "script")
quem_chamou: ContextVar[str] = ContextVar("quem_chamou", default=_padrao if _padrao in CHAMADORES else "script")
# Qual rota ou ferramenta chamou. O serviço HTTP define a rota a cada requisição;
# fora dele vale a variável ORIGEM_ROTA ou o nome do script (lote.py, classificar.py...).
_rota_padrao = os.environ.get("ORIGEM_ROTA") or Path(sys.argv[0]).name or "script"
rota: ContextVar[str] = ContextVar("rota", default=_rota_padrao)
ativo: ContextVar[bool] = ContextVar("ativo", default=True)  # o resumo desliga para não se registrar
_trava = threading.Lock()


def registrar(funcao: str, parametros: dict, resultado: str, registros: int = 0,
              ids: list | None = None, fonte: str | None = None, erro: str | None = None,
              duracao_ms: float = 0.0) -> None:
    """Acrescenta uma linha ao log. Usado pelo decorador e pelo serviço HTTP."""
    if not ativo.get():
        return
    linha = {
        "data_hora": datetime.now().astimezone().isoformat(timespec="seconds"),
        "funcao": funcao,
        "quem_chamou": quem_chamou.get(),
        "rota": rota.get(),
        "parametros": parametros,
        "fonte": fonte,
        "resultado": resultado,
        "registros": registros,
    }
    if ids is not None:
        linha["ids"] = ids
    if erro is not None:
        linha["erro"] = erro
    linha["duracao_ms"] = round(duracao_ms, 1)
    try:
        with _trava:
            ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
            with ARQUIVO.open("a", encoding="utf-8") as arquivo:
                arquivo.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except OSError:
        pass


def descrever_erro(excecao: BaseException) -> str:
    """Tipo + primeira linha da mensagem, curta: não vaza stack trace nem conteúdo."""
    mensagem = str(excecao).strip().splitlines()[0] if str(excecao).strip() else ""
    return f"{type(excecao).__name__}: {mensagem[:160]}" if mensagem else type(excecao).__name__


def _contar(retorno) -> tuple[str, int, list | None]:
    """Traduz o retorno de uma função em (resultado, quantidade, ids)."""
    if retorno is None:
        return "nao-encontrado", 0, None
    if isinstance(retorno, dict) and "id" in retorno:  # um registro só (buscar_produto)
        return "sucesso", 1, [retorno["id"]]
    if isinstance(retorno, dict):  # {usuario_id: [...]} (historicos_de_todos)
        return "sucesso", len(retorno), list(retorno)
    ids = [item["id"] if isinstance(item, dict) else item for item in retorno]
    return "sucesso", len(ids), ids


def registrado(em_massa: bool = False, fonte=None):
    """Decorador: registra cada chamada da função no log.

    em_massa=True para funções que devolvem a tabela inteira: o log guarda só a
    quantidade, não a lista de ids (senão cada linha teria milhares de ids e o
    "registro mais consultado" seria sempre um empate).
    `fonte` é uma função sem argumentos que diz de onde vieram os dados.
    """
    def decorar(funcao):
        nomes = funcao.__code__.co_varnames[:funcao.__code__.co_argcount]

        @functools.wraps(funcao)
        def envolvida(*args, **kwargs):
            parametros = {**dict(zip(nomes, args)), **kwargs}
            inicio = time.perf_counter()
            try:
                retorno = funcao(*args, **kwargs)
            except Exception as excecao:
                registrar(funcao.__name__, parametros, "erro", fonte=fonte() if fonte else None,
                          erro=descrever_erro(excecao), duracao_ms=(time.perf_counter() - inicio) * 1000)
                raise
            resultado, quantidade, ids = _contar(retorno)
            registrar(funcao.__name__, parametros, resultado, quantidade,
                      None if em_massa else ids, fonte() if fonte else None,
                      duracao_ms=(time.perf_counter() - inicio) * 1000)
            return retorno

        return envolvida

    return decorar
