"""Resumo do log de uso (logs/uso_dados.jsonl): o que o módulo leu, quanto e o que deu errado.

Responde às três perguntas do Projeto Final de IA:
  (a) qual dado o módulo mais usa?
  (b) algum dado nunca foi usado, e o que isso sugere?
  (c) houve erro, e por quê?

Uso (dentro de ia-recomendacao/):
    uv run python resumo.py                       # imprime o resumo em Markdown
    uv run python resumo.py --saida resumo.md     # e também grava num arquivo
    uv run python resumo.py --log outro.jsonl     # resume outro log

Para saber o que "nunca foi usado", o resumo compara o log com o catálogo
atual, lido pelas próprias funções de dados.py (com o log desligado, para o
resumo não contar a si mesmo). Banco fora do ar: lê o retrato JSON.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import dados
import uso

# Em quais funções os ids (nos parâmetros ou no retorno) são ids de PRODUTO.
PRODUTO_NO_PARAMETRO = {"buscar_produto", "listar_avaliacoes", "recomendar_por_produto",
                        "sentimento_do_produto", "classificar_produto", "gravar_classificacao"}
PRODUTO_NO_RETORNO = {"buscar_produto", "historico_do_usuario", "recomendar_por_produto",
                      "recomendar_por_usuario"}
USUARIO_NO_PARAMETRO = {"historico_do_usuario", "recomendar_por_usuario"}
FUNCOES_CONHECIDAS = ["listar_produtos", "buscar_produto", "historico_do_usuario", "listar_avaliacoes",
                      "listar_compradores", "historicos_de_todos", "recomendar_por_produto",
                      "recomendar_por_usuario", "sentimento_do_produto",
                      "classificar_produto", "gravar_classificacao"]


def ler_log(arquivo: Path) -> list[dict]:
    """Lê o .jsonl; linha corrompida é contada à parte, sem derrubar o resumo."""
    linhas, ruins = [], 0
    for texto in arquivo.read_text(encoding="utf-8").splitlines():
        if not texto.strip():
            continue
        try:
            linhas.append(json.loads(texto))
        except json.JSONDecodeError:
            ruins += 1
    if ruins:
        print(f"> Aviso: {ruins} linha(s) ilegível(is) no log foram ignoradas.\n")
    return linhas


def ler_catalogo() -> tuple[list[dict], list[int], str]:
    """Produtos e compradores atuais, sem escrever no log de uso."""
    token = uso.ativo.set(False)
    try:
        produtos = dados.listar_produtos()
        compradores = dados.listar_compradores()
        return produtos, compradores, dados.ULTIMA_FONTE
    finally:
        uso.ativo.reset(token)


def contar(linhas: list[dict]) -> dict:
    por_funcao: dict[str, Counter] = defaultdict(Counter)
    lidos: Counter = Counter()  # registros devolvidos, somados por função
    quem, fontes, rotas = Counter(), Counter(), Counter()
    produtos_consultados, produtos_devolvidos, usuarios = Counter(), Counter(), Counter()
    erros: dict[str, list[dict]] = defaultdict(list)
    for linha in linhas:
        funcao = linha["funcao"]
        por_funcao[funcao][linha["resultado"]] += 1
        lidos[funcao] += linha.get("registros") or 0
        quem[linha["quem_chamou"]] += 1
        if linha.get("rota"):  # logs anteriores a 27/11 não têm o campo
            rotas[linha["rota"]] += 1
        if linha.get("fonte"):
            fontes[linha["fonte"]] += 1
        parametros = linha.get("parametros") or {}
        if funcao in PRODUTO_NO_PARAMETRO and "produto_id" in parametros:
            produtos_consultados[parametros["produto_id"]] += 1
        if funcao in PRODUTO_NO_RETORNO and funcao != "buscar_produto":
            produtos_devolvidos.update(linha.get("ids") or [])
        if funcao in USUARIO_NO_PARAMETRO and "usuario_id" in parametros:
            usuarios[parametros["usuario_id"]] += 1
        if linha["resultado"] == "erro":
            erros[linha.get("erro", "sem motivo registrado")].append(linha)
    return {"por_funcao": por_funcao, "lidos": lidos, "quem": quem, "rotas": rotas, "fontes": fontes, "erros": erros,
            "consultados": produtos_consultados, "devolvidos": produtos_devolvidos, "usuarios": usuarios}


def porque_nao_usado(produto: dict) -> str:
    """Explica, pelos dados do próprio produto, por que ele não aparece."""
    motivos = []
    if produto["status"] != "ativo":
        motivos.append(f"status {produto['status']}")
    if produto["estoque"] <= 0:
        motivos.append("sem estoque")
    if not produto.get("artesaoAprovado", True):
        motivos.append("artesão não aprovado")
    if motivos:
        return ", ".join(motivos) + " → fora das recomendações pela RF-04 (correto)"
    if produto["vendas"] == 0 and produto["notaMedia"] == 0:
        return "sem venda e sem avaliação → popularidade 0 e nenhum semelhante pedido (arranque a frio)"
    return "elegível, mas nenhuma chamada pediu algo parecido com ele"


def montar(linhas: list[dict], produtos: list[dict], compradores: list[int], fonte_catalogo: str) -> str:
    c = contar(linhas)
    nomes = {p["id"]: p["nome"] for p in produtos}
    # Ids que não existem no catálogo (ex.: 999) já aparecem como "não encontrado"; fora do ranking.
    uso_total = Counter({pid: n for pid, n in (c["consultados"] + c["devolvidos"]).items() if pid in nomes})
    saida: list[str] = []
    escreve = saida.append

    total = len(linhas)
    inicio, fim = linhas[0]["data_hora"], linhas[-1]["data_hora"]
    escreve("# Resumo do log de uso do módulo de IA\n")
    escreve(f"{total} chamadas registradas, de {inicio} a {fim}. "
            f"Catálogo comparado: {len(produtos)} produtos e {len(compradores)} compradores (lidos do {fonte_catalogo}).\n")

    escreve("## Chamadas por função\n")
    escreve("| Função | Chamadas | Sucesso | Não encontrado | Erro | Registros devolvidos |")
    escreve("|---|---:|---:|---:|---:|---:|")
    for funcao, contagem in sorted(c["por_funcao"].items(), key=lambda kv: -sum(kv[1].values())):
        escreve(f"| `{funcao}` | {sum(contagem.values())} | {contagem['sucesso']} | "
                f"{contagem['nao-encontrado']} | {contagem['erro']} | {c['lidos'][funcao]} |")
    nunca = [f for f in FUNCOES_CONHECIDAS if f not in c["por_funcao"]]
    escreve("")
    if nunca:
        escreve("Funções nunca chamadas: " + ", ".join(f"`{f}`" for f in nunca) + ".\n")

    escreve("## Quem chamou e de onde vieram os dados\n")
    escreve("Quem chamou: " + ", ".join(f"{q} {n}" for q, n in c["quem"].most_common()) + ".  ")
    if c["rotas"]:
        escreve("Por rota ou ferramenta: " + ", ".join(f"`{r}` {n}" for r, n in c["rotas"].most_common()) + ".  ")
    escreve("Fonte: " + (", ".join(f"{f} {n}" for f, n in c["fontes"].most_common()) or "nenhuma") + ".\n")

    escreve("## Produtos mais usados\n")
    escreve("\"Consultado\" = o produto foi o assunto da chamada (detalhe, avaliações, referência); "
            "\"devolvido\" = apareceu numa lista de recomendações ou num histórico.\n")
    escreve("| Produto | Nome | Consultado | Devolvido | Total |")
    escreve("|---:|---|---:|---:|---:|")
    for pid, n in uso_total.most_common(5):
        escreve(f"| {pid} | {nomes[pid]} | {c['consultados'][pid]} | "
                f"{c['devolvidos'][pid]} | {n} |")
    escreve("")

    nao_usados = [p for p in produtos if p["id"] not in uso_total]
    escreve("## Produtos nunca usados\n")
    if nao_usados:
        escreve("| Produto | Nome | Por quê |")
        escreve("|---:|---|---|")
        for p in nao_usados:
            escreve(f"| {p['id']} | {p['nome']} | {porque_nao_usado(p)} |")
    else:
        escreve("Todos os produtos do catálogo apareceram ao menos uma vez.")
    escreve("")
    compradores_sem_consulta = [u for u in compradores if u not in c["usuarios"]]
    escreve(f"Compradores com recomendação ou histórico consultado: {len(c['usuarios'])} de {len(compradores)}"
            + (f" (nunca consultados: {', '.join(map(str, compradores_sem_consulta))})." if compradores_sem_consulta else ".")
            + "\n")

    escreve("## Erros\n")
    n_erros = sum(len(v) for v in c["erros"].values())
    if n_erros:
        escreve("| Motivo | Vezes | Função | Última vez |")
        escreve("|---|---:|---|---|")
        for motivo, ocorrencias in sorted(c["erros"].items(), key=lambda kv: -len(kv[1])):
            funcoes = ", ".join(sorted({o["funcao"] for o in ocorrencias}))
            escreve(f"| {motivo} | {len(ocorrencias)} | {funcoes} | {ocorrencias[-1]['data_hora']} |")
    else:
        escreve("Nenhuma chamada terminou em erro.")
    nao_encontrados = sum(v["nao-encontrado"] for v in c["por_funcao"].values())
    escreve(f"\nAlém disso, {nao_encontrados} chamada(s) pediram um id que não existe (\"não encontrado\"). "
            "Isso não é erro do módulo: a resposta certa é 404 (RF-02).\n")

    # --- respostas -------------------------------------------------------------
    escreve("## Respostas\n")
    # "Mais usa" = mais registros lidos; empate sai pelo número de chamadas.
    funcao_top = max(c["por_funcao"], key=lambda f: (c["lidos"][f], sum(c["por_funcao"][f].values())))
    chamadas_top = sum(c["por_funcao"][funcao_top].values())
    texto_a = (f"**(a) Qual dado o módulo mais usa?** `{funcao_top}`: {chamadas_top} de {total} chamadas e "
               f"{c['lidos'][funcao_top]} registros devolvidos, mais que qualquer outra função.")
    if funcao_top == "listar_produtos":
        texto_a += (" Ou seja, o catálogo inteiro de produtos: toda recomendação lê todos os produtos para "
                    "comparar com a referência e calcular a popularidade.")
    if uso_total:
        pid, n = uso_total.most_common(1)[0]
        texto_a += f" O registro mais usado foi o produto {pid} ({nomes.get(pid, '?')}), em {n} chamadas."
    escreve(texto_a + "\n")

    partes_b = []
    if nao_usados:
        partes_b.append(f"{len(nao_usados)} produto(s) nunca apareceram ("
                        + ", ".join(f"{p['id']}" for p in nao_usados) + "). O motivo de cada um está na tabela acima: "
                        "os que estão sem estoque ou inativos ficam de fora pela regra (o filtro funciona); os que "
                        "não têm venda nem avaliação mostram o arranque a frio, porque a popularidade não ajuda "
                        "produto novo, e ele só aparece se alguém pedir um semelhante")
    if nunca:
        partes_b.append("as funções " + ", ".join(f"`{f}`" for f in nunca) + " não foram chamadas neste período")
    escreve("**(b) Algum dado nunca foi usado?** " + ("; ".join(partes_b) + "." if partes_b
                                                      else "Não: todo produto e toda função apareceram.") + "\n")

    if n_erros:
        explicacoes = []
        for motivo, ocorrencias in sorted(c["erros"].items(), key=lambda kv: -len(kv[1])):
            if "TimeoutError" in motivo:
                porque = "a estratégia passou de 2 s e o serviço respondeu 503 em vez de deixar o cliente esperando (RF-08)"
            elif "falha simulada" in motivo:
                porque = "falha provocada de propósito pelo header X-Simular-Falha, para testar o RF-08"
            elif "FileNotFoundError" in motivo:
                porque = "o banco estava fora do ar e o retrato JSON também não existia, então não havia de onde ler"
            else:
                porque = "veja a função e o horário na tabela de erros"
            explicacoes.append(f"{len(ocorrencias)}× \"{motivo}\": {porque}")
        texto_c = f"**(c) Houve erro?** Sim, {n_erros}. " + "; ".join(explicacoes) + "."
        if c["fontes"].get("retrato"):
            texto_c += (f" Em {c['fontes']['retrato']} chamada(s) o banco estava fora do ar e os dados vieram do retrato "
                        "JSON; isso não conta como erro, porque a resposta saiu.")
    else:
        texto_c = "**(c) Houve erro?** Não."
    escreve(texto_c + "\n")
    return "\n".join(saida)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--log", type=Path, default=uso.ARQUIVO)
    parser.add_argument("--saida", type=Path)
    args = parser.parse_args()
    if not args.log.exists():
        raise SystemExit(f"Log não encontrado: {args.log}. Faça algumas chamadas ao módulo primeiro (veja o README).")
    linhas = ler_log(args.log)
    if not linhas:
        raise SystemExit("O log está vazio.")
    texto = montar(linhas, *ler_catalogo())
    print(texto)
    if args.saida:
        args.saida.write_text(texto + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
