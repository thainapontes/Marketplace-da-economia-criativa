"""Etapa offline: lê o catálogo sintético, calcula a popularidade e guarda o modelo no BentoML.

Popularidade (RF-07) = 0,7 × vendas normalizadas + 0,3 × nota média / 5, em escala 0…1.
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import bentoml

DADOS = Path(__file__).resolve().parent / "dados" / "catalogo.json"
ARTEFATO = "model.pkl"
NOME_MODELO = "recomendador-origem"


def main() -> None:
    catalogo = json.loads(DADOS.read_text(encoding="utf-8"))
    # Chaves em texto: o mesmo formato que o JSON usa para `historico`.
    produtos = {str(p["id"]): p for p in catalogo["produtos"]}

    max_vendas = max(p["vendas"] for p in produtos.values()) or 1
    pop = {
        pid: round(0.7 * p["vendas"] / max_vendas + 0.3 * p["notaMedia"] / 5, 4)
        for pid, p in produtos.items()
    }
    ranking = sorted(produtos, key=lambda pid: (-pop[pid], int(pid)))

    artefato = {
        "produtos": produtos,
        "pop": pop,
        "ranking_popularidade": ranking,
        "historico": catalogo["historico"],
        "usuarios": catalogo["usuarios"],
    }

    with bentoml.models.create(
        NOME_MODELO,
        labels={"projeto": "origem", "modulo": "recomendacao"},
        metadata={
            "n_produtos": len(produtos),
            "n_usuarios_com_historico": len(catalogo["historico"]),
            "estrategias": "similaridade (RF-01), historico (RF-06), popularidade (RF-07)",
        },
    ) as model:
        Path(model.path_of(ARTEFATO)).write_bytes(pickle.dumps(artefato))
        tag = model.tag

    print(f"produtos no catálogo  {len(produtos)}")
    print(f"mais populares        {', '.join(ranking[:3])}")
    print(f"tag no store          {tag}")


if __name__ == "__main__":
    main()
