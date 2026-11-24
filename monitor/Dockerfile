# Monitor do Origem (PI 3 · P3). A mesma imagem roda os dois serviços:
#   coletor → threads de coleta + API interna na porta 8001 (padrão)
#   painel  → telas web na porta 8080 (command e PORTA no compose.yaml)
# Contexto do build: a RAIZ do repositório, porque o monitor usa o pacote estruturas/.
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORTA=8001

COPY estruturas /app/estruturas
WORKDIR /app/monitor
COPY monitor/pyproject.toml monitor/uv.lock monitor/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY monitor .

EXPOSE 8001 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORTA\"]}/saude', timeout=2).status == 200 else 1)"

CMD ["uv", "run", "--frozen", "--no-dev", "uvicorn", "monitor.api_coletor:app", "--host", "0.0.0.0", "--port", "8001"]
