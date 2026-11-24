"""Medição do nível 2 do painel: os containers do projeto Origem.

Para cada container do projeto (rótulo do Compose): status, health, CPU,
memória com uso e limite, reinícios e se o OOM Killer o matou.

CPU: a API devolve o tempo de CPU acumulado do container, em nanossegundos.
O uso em % é a diferença entre duas leituras dividida pelo tempo de relógio
que passou — 100% = um núcleo inteiro ocupado (como no `docker stats`).

Memória: o "uso" que o cgroup informa inclui cache de arquivos que o kernel
pode devolver a qualquer momento. Como o `docker stats`, descontamos o
``inactive_file`` quando a API o informa.
"""

import os
import time

from estruturas import ListaEncadeada, TabelaHash

from .docker_api import ClienteDocker, ErroDocker

PROJETO = os.environ.get("PROJETO_COMPOSE", "origem")


class MedidorDeContainers:
    def __init__(self, cliente=None, projeto: str = PROJETO):
        self.cliente = cliente or ClienteDocker()
        self.projeto = projeto
        self._cpu_anterior = TabelaHash()  # id → (tempo de CPU em ns, instante em ns)

    def _uso_de_cpu(self, id_: str, stats) -> float:
        total_ns = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage")
        agora_ns = time.monotonic_ns()
        if total_ns is None:
            return 0.0
        anterior = self._cpu_anterior.obter(id_, None)
        self._cpu_anterior.colocar(id_, (total_ns, agora_ns))
        if anterior is None or agora_ns <= anterior[1] or total_ns < anterior[0]:
            return 0.0  # primeira leitura, ou o container reiniciou e o contador zerou
        return round(100 * (total_ns - anterior[0]) / (agora_ns - anterior[1]), 1)

    @staticmethod
    def _memoria(stats):
        m = stats.get("memory_stats") or {}
        uso = m.get("usage") or 0
        inativo = (m.get("stats") or {}).get("inactive_file") or 0
        uso = max(0, uso - inativo)
        limite = m.get("limit") or 0
        return uso, limite

    def medir(self) -> ListaEncadeada:
        resultado = ListaEncadeada()
        for resumo in self.cliente.listar(self.projeto):
            id_ = resumo["Id"]
            rotulos = resumo.get("Labels") or {}
            info = self.cliente.inspecionar(id_)
            estado = info.get("State") or {}
            c = TabelaHash()
            c.colocar("id", id_[:12])
            c.colocar("nome", rotulos.get("com.docker.compose.service") or resumo["Names"][0].lstrip("/"))
            c.colocar("container", (info.get("Name") or resumo["Names"][0]).lstrip("/"))
            c.colocar("status", estado.get("Status", "desconhecido"))
            c.colocar("health", (estado.get("Health") or {}).get("Status"))
            c.colocar("reinicios", info.get("RestartCount", 0))
            c.colocar("oom_killed", bool(estado.get("OOMKilled")))
            c.colocar("codigo_saida", estado.get("ExitCode"))
            c.colocar("iniciado_em", estado.get("StartedAt"))
            cpu, uso, limite = 0.0, 0, 0
            if estado.get("Status") == "running":
                try:
                    stats = self.cliente.estatisticas(id_)
                    cpu = self._uso_de_cpu(id_, stats)
                    uso, limite = self._memoria(stats)
                except ErroDocker:
                    pass  # o container pode ter parado entre a lista e o stats
            if not limite:  # container parado: sem stats, o limite vem da configuração
                limite = (info.get("HostConfig") or {}).get("Memory") or 0
            c.colocar("cpu", cpu)
            c.colocar("memoria_uso", uso)
            c.colocar("memoria_limite", limite)
            c.colocar("memoria_percentual", round(100 * uso / limite, 1) if limite else 0.0)
            resultado.inserir_ordenado(c, chave=lambda x: x["nome"])
        return resultado
