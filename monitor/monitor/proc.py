"""Leitura das métricas de hardware e SO direto do /proc (nível 1 do painel).

O coletor roda num container, mas mede a MÁQUINA: o /proc do host é montado em
``/host/proc`` e a raiz do host em ``/host/root``, os dois somente leitura
(ver compose.yaml). Fora do container, ``PROC=/proc`` e ``RAIZ=/`` medem a
própria máquina, o que é útil para testar.

Nada aqui usa bibliotecas de terceiros: cada número sai de um arquivo de texto
do kernel.
"""

import os
import time

from estruturas import ListaEncadeada, TabelaHash

PROC = os.environ.get("PROC", "/host/proc")
RAIZ = os.environ.get("RAIZ", "/host/root")


def _ler(caminho: str) -> str:
    with open(caminho, encoding="utf-8", errors="replace") as arquivo:
        return arquivo.read()


# ---------------------------------------------------------------------- CPU
def tempos_de_cpu() -> TabelaHash:
    """/proc/stat: para "cpu" (total) e cada "cpuN", o par (ocupado, total) em jiffies.

    Os valores são acumulados desde o boot; o uso em % sai da diferença entre
    duas leituras (``uso_de_cpu``).
    """
    tempos = TabelaHash()
    for linha in _ler(f"{PROC}/stat").splitlines():
        if not linha.startswith("cpu"):
            break
        campos = linha.split()
        valores = ListaEncadeada(int(v) for v in campos[1:])
        total = 0
        for v in valores:
            total += v
        ocioso = valores[3] + valores[4]  # idle + iowait
        tempos.colocar(campos[0], (total - ocioso, total))
    return tempos


def uso_de_cpu(antes: TabelaHash, depois: TabelaHash) -> TabelaHash:
    """% de uso de cada CPU entre duas leituras de ``tempos_de_cpu``."""
    uso = TabelaHash()
    for nome, (ocupado2, total2) in depois.itens():
        ocupado1, total1 = antes.obter(nome, (ocupado2, total2))
        delta_total = total2 - total1
        uso.colocar(nome, round(100 * (ocupado2 - ocupado1) / delta_total, 1) if delta_total > 0 else 0.0)
    return uso


# ------------------------------------------------------------------ memória
def memoria() -> TabelaHash:
    """/proc/meminfo, em bytes. "Usada" = total − disponível (o que o kernel não consegue liberar)."""
    kb = TabelaHash()
    for linha in _ler(f"{PROC}/meminfo").splitlines():
        nome, _, resto = linha.partition(":")
        partes = resto.split()
        if partes:
            kb.colocar(nome, int(partes[0]))
    total = kb.obter("MemTotal", 0) * 1024
    disponivel = kb.obter("MemAvailable", 0) * 1024
    swap_total = kb.obter("SwapTotal", 0) * 1024
    swap_livre = kb.obter("SwapFree", 0) * 1024
    m = TabelaHash()
    m.colocar("total", total)
    m.colocar("disponivel", disponivel)
    m.colocar("usada", total - disponivel)
    m.colocar("percentual", round(100 * (total - disponivel) / total, 1) if total else 0.0)
    m.colocar("cache", (kb.obter("Cached", 0) + kb.obter("Buffers", 0)) * 1024)
    m.colocar("swap_total", swap_total)
    m.colocar("swap_usada", swap_total - swap_livre)
    return m


# -------------------------------------------------------------------- disco
def _prioridade(ponto: str) -> int:
    """Quanto menor, mais representativo é o ponto de montagem de um disco."""
    for i, preferido in enumerate(("/", "/var", "/home")):
        if ponto == preferido:
            return i
    return 10 + ponto.count("/")


def discos() -> ListaEncadeada:
    """Uso de cada disco real da máquina.

    Lê os pontos de montagem do host em /proc/1/mounts e fica só com os
    dispositivos de bloco (/dev/...). Um mesmo disco costuma aparecer em vários
    pontos (no Bazzite, /etc, /sysroot, /var e /var/home são todos o mesmo
    btrfs); fica o mais representativo: "/", depois "/var", "/home" e, por fim,
    o mais raso. Assim funciona também onde a raiz é uma imagem somente leitura,
    que sempre aparece 100% cheia e não é um dispositivo /dev.
    """
    escolhido = TabelaHash()  # dispositivo → ponto de montagem
    for linha in _ler(f"{PROC}/1/mounts").splitlines():
        partes = linha.split()
        if len(partes) < 3 or not partes[0].startswith("/dev/"):
            continue
        dispositivo, ponto = partes[0], partes[1].replace("\\040", " ")
        atual = escolhido.obter(dispositivo, None)
        if atual is None or _prioridade(ponto) < _prioridade(atual):
            escolhido.colocar(dispositivo, ponto)

    resultado = ListaEncadeada()
    for dispositivo, ponto in escolhido.itens():
        try:
            st = os.statvfs(RAIZ.rstrip("/") + ponto)
        except OSError:
            continue
        total = st.f_blocks * st.f_frsize
        livre = st.f_bavail * st.f_frsize
        if total == 0:
            continue
        d = TabelaHash()
        d.colocar("dispositivo", dispositivo)
        d.colocar("montagem", ponto)
        d.colocar("total", total)
        d.colocar("usado", total - livre)
        d.colocar("percentual", round(100 * (total - livre) / total, 1))
        resultado.inserir_ordenado(d, chave=lambda x: x["montagem"])
    return resultado


# ------------------------------------------------------ processos e threads
def processos_e_threads() -> TabelaHash:
    """Conta os processos (pastas numéricas do /proc) e soma as threads de cada um."""
    processos = 0
    threads = 0
    estados = TabelaHash()  # R executando, S dormindo, D esperando disco, Z zumbi...
    for nome in os.listdir(PROC):
        if not nome.isdigit():
            continue
        try:
            status = _ler(f"{PROC}/{nome}/status")
        except OSError:  # o processo terminou entre o listdir e a leitura
            continue
        processos += 1
        for linha in status.splitlines():
            if linha.startswith("State:"):
                letra = linha.split()[1]
                estados.colocar(letra, estados.obter(letra, 0) + 1)
            elif linha.startswith("Threads:"):
                threads += int(linha.split()[1])
                break
    r = TabelaHash()
    r.colocar("processos", processos)
    r.colocar("threads", threads)
    r.colocar("estados", estados)
    return r


def carga_e_tempo_ligado() -> TabelaHash:
    carga = _ler(f"{PROC}/loadavg").split()
    r = TabelaHash()
    r.colocar("carga_1min", float(carga[0]))
    r.colocar("carga_5min", float(carga[1]))
    r.colocar("carga_15min", float(carga[2]))
    r.colocar("ligado_ha_s", int(float(_ler(f"{PROC}/uptime").split()[0])))
    return r


def amostra_de_hardware(tempos_anteriores: TabelaHash) -> tuple[TabelaHash, TabelaHash]:
    """Uma leitura completa do nível 1. Devolve (amostra, tempos de CPU para a próxima)."""
    tempos = tempos_de_cpu()
    uso = uso_de_cpu(tempos_anteriores, tempos)
    nucleos = ListaEncadeada()
    i = 0
    while f"cpu{i}" in uso:
        nucleos.inserir_fim(uso[f"cpu{i}"])
        i += 1
    a = TabelaHash()
    a.colocar("instante", time.time())
    a.colocar("cpu_total", uso.obter("cpu", 0.0))
    a.colocar("cpu_nucleos", nucleos)
    a.colocar("memoria", memoria())
    a.colocar("discos", discos())
    a.colocar("processos", processos_e_threads())
    a.colocar("sistema", carga_e_tempo_ligado())
    return a, tempos
