"""Demonstração do OOM Killer: aloca memória aos poucos até o kernel matar o processo.

Roda num container com limite de 64 MB (serviço ``estressor`` do compose.yaml,
no perfil "demo"). Cada passo reserva mais um bloco e ESCREVE nele — memória
só reservada, sem escrita, não chega a ocupar RAM. Quando o uso passa do
limite do cgroup, o OOM Killer mata o processo com SIGKILL (código 137) e o
Docker marca o container como OOMKilled. O coletor vê os dois: primeiro o
alerta de memória alta, depois o evento de OOM.

    docker compose --profile demo up estressor
"""

import os
import time

from estruturas import ListaEncadeada

BLOCO_MB = int(os.environ.get("BLOCO_MB", 4))
PAUSA_S = float(os.environ.get("PAUSA_S", 1))


def main() -> None:
    blocos = ListaEncadeada()  # mantém as referências: sem elas o coletor de lixo devolveria a memória
    total = 0
    print(f"estressor: alocando {BLOCO_MB} MB a cada {PAUSA_S} s até o OOM Killer agir", flush=True)
    while True:
        blocos.inserir_fim(b"\x01" * (BLOCO_MB * 2**20))  # bytes já preenchidos = páginas realmente usadas
        total += BLOCO_MB
        print(f"estressor: {total} MB alocados", flush=True)
        time.sleep(PAUSA_S)


if __name__ == "__main__":
    main()
