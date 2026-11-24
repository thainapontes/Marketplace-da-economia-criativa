# Módulo de IA do Origem, servido com BentoML (PI 3 · P1).
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

WORKDIR /app

# Dependências travadas no uv.lock, numa camada própria.
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-install-project

COPY . .

EXPOSE 3001

# /healthz é a rota de saúde do próprio BentoML e não depende do banco.
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=6 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:3001/healthz', timeout=2).status == 200 else 1)"

CMD ["uv", "run", "--frozen", "bentoml", "serve", "service:RecomendadorOrigem", "--host", "0.0.0.0", "--port", "3001"]
