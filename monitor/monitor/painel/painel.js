// Painel do monitor: busca o estado no coletor (pela rota /api do painel) a cada 2 s.
const INTERVALO_MS = 2000;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- formatos
function bytes(n) {
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < unidades.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i >= 3 ? 1 : 0)} ${unidades[i]}`;
}
function duracao(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min ${s % 60} s`;
}
function nivel(pct) { return pct >= 90 ? "critico" : pct >= 70 ? "atencao" : ""; }
function barra(el, pct) { el.style.width = `${Math.min(100, pct)}%`; el.className = nivel(pct); }

function historico(svg, valores) {
  if (!valores.length) return;
  const n = Math.max(valores.length - 1, 1);
  const pontos = valores.map((v, i) => `${(i / n) * 300},${60 - (Math.min(v, 100) / 100) * 58}`).join(" ");
  svg.innerHTML = `<polygon class="area" points="0,60 ${pontos} 300,60"/><polyline points="${pontos}"/>`;
}

// ------------------------------------------------------------------ telas
function desenharHardware({ ultimo: a, historico: h }) {
  $("cpu-total").textContent = `${a.cpu_total.toFixed(1)}%`;
  $("cpu-nucleos").innerHTML = a.cpu_nucleos.map((pct, i) => `
    <div class="nucleo"><span class="rotulo">cpu${i}</span>
      <div class="barra"><span class="${nivel(pct)}" style="width:${Math.min(100, pct)}%"></span></div>
      <span class="valor">${pct.toFixed(0)}%</span></div>`).join("");
  historico($("cpu-historico"), h.map((x) => x.cpu_total));

  const m = a.memoria;
  $("mem-pct").textContent = `${m.percentual.toFixed(1)}%`;
  barra($("mem-barra"), m.percentual);
  $("mem-usada").textContent = `${bytes(m.usada)} de ${bytes(m.total)}`;
  $("mem-disp").textContent = bytes(m.disponivel);
  $("mem-cache").textContent = bytes(m.cache);
  $("mem-swap").textContent = m.swap_total ? `${bytes(m.swap_usada)} de ${bytes(m.swap_total)}` : "sem swap";
  historico($("mem-historico"), h.map((x) => x.memoria.percentual));

  $("discos").innerHTML = a.discos.map((d) => `
    <div class="disco"><div class="linha"><span>${d.montagem} <small>${d.dispositivo}</small></span>
      <span>${bytes(d.usado)} / ${bytes(d.total)} · ${d.percentual.toFixed(0)}%</span></div>
      <div class="barra"><span class="${nivel(d.percentual)}" style="width:${d.percentual}%"></span></div></div>`).join("")
    || `<p class="nota">nenhum disco encontrado</p>`;

  const p = a.processos;
  $("processos").textContent = p.processos;
  $("threads").textContent = p.threads;
  const nomes = { R: "executando", S: "dormindo", D: "esperando E/S", I: "ociosos (kernel)", Z: "zumbis", T: "parados" };
  $("estados").textContent = Object.entries(p.estados).sort((x, y) => y[1] - x[1])
    .map(([letra, qtd]) => `${qtd} ${nomes[letra] ?? letra}`).join(" · ");

  const s = a.sistema;
  $("carga").textContent = `${s.carga_1min.toFixed(2)} / ${s.carga_5min.toFixed(2)} / ${s.carga_15min.toFixed(2)}`;
  $("ligado").textContent = duracao(s.ligado_ha_s);
  $("instante").textContent = new Date(a.instante * 1000).toLocaleTimeString("pt-BR");
}

function selo(texto, classe) { return `<span class="selo ${classe}">${texto}</span>`; }
function escapar(t) { return String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

function desenharContainers({ ultimo: lista }) {
  const rodando = lista.filter((c) => c.status === "running").length;
  $("containers-resumo").textContent = `${rodando} de ${lista.length} rodando`;
  $("containers").innerHTML = lista.map((c) => {
    const status = selo(c.status, c.status === "running" ? "ok" : c.oom_killed ? "critico" : "atencao");
    const health = c.health ? selo(c.health, c.health === "healthy" ? "ok" : c.health === "starting" ? "" : "critico") : `<small>sem healthcheck</small>`;
    const mem = c.memoria_limite
      ? `<div class="mem-celula"><span>${bytes(c.memoria_uso)} / ${bytes(c.memoria_limite)}</span><small>${c.memoria_percentual.toFixed(0)}%</small>
           <div class="barra"><span class="${nivel(c.memoria_percentual)}" style="width:${Math.min(100, c.memoria_percentual)}%"></span></div></div>`
      : `<small>—</small>`;
    const oom = c.oom_killed ? selo(`OOMKilled · ${c.codigo_saida}`, "critico") : `<small>não</small>`;
    return `<tr><td><strong>${escapar(c.nome)}</strong><br><small>${escapar(c.container)}</small></td><td>${status}</td><td>${health}</td>
      <td class="num">${c.cpu.toFixed(1)}%</td><td>${mem}</td><td class="num">${c.reinicios}</td><td>${oom}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="nota">nenhum container do projeto</td></tr>`;
}

const latencias = {};  // serviço → últimas latências, para o mini-gráfico
function desenharServicos({ ultimo: lista, historico: h }) {
  for (const s of lista) latencias[s.nome] = h.map((amostra) => (amostra.find((x) => x.nome === s.nome) || {}).latencia_ms ?? 0);
  $("servicos").innerHTML = lista.map((s) => {
    const maior = Math.max(...latencias[s.nome], 1);
    const pontos = latencias[s.nome];
    const n = Math.max(pontos.length - 1, 1);
    const linha = pontos.map((v, i) => `${(i / n) * 300},${58 - (v / maior) * 54}`).join(" ");
    return `<article class="cartao servico">
      <header><h2>${escapar(s.nome)}</h2>${s.ok ? selo("no ar", "ok") : selo("fora do ar", "critico")}</header>
      <p class="url">${escapar(s.url)}</p>
      <dl class="dados">
        <dt>Tempo de resposta</dt><dd>${s.latencia_ms.toFixed(0)} ms</dd>
        <dt>HTTP</dt><dd>${s.status_http ?? escapar(s.erro)}</dd>
        <dt>No ar há</dt><dd>${s.ok ? duracao(s.no_ar_ha_s) : "—"}</dd>
        <dt>Disponibilidade</dt><dd>${s.disponibilidade.toFixed(1)}%</dd>
      </dl>
      <svg class="historico" viewBox="0 0 300 60" preserveAspectRatio="none" aria-label="Histórico do tempo de resposta">
        <polyline points="${linha}"/></svg>
    </article>`;
  }).join("");
}

function desenharEventos(lista, contagem) {
  const nomes = { info: "info", atencao: "atenção", critico: "crítico" };
  $("eventos-contagem").textContent = Object.entries(contagem).map(([k, v]) => `${v} ${nomes[k] ?? k}`).join(" · ");
  $("eventos").innerHTML = lista.map((e) => `<li>
      <span class="quando">${new Date(e.instante * 1000).toLocaleTimeString("pt-BR")}</span>
      <span>${selo(nomes[e.severidade] ?? e.severidade, e.severidade === "info" ? "" : e.severidade)}</span>
      <span><span class="origem">${escapar(e.nivel)}/${escapar(e.origem)}</span> · ${escapar(e.mensagem)}</span></li>`).join("")
    || `<li class="nota">nenhum evento ainda</li>`;
}

function desenharColetor(c) {
  const vivas = Object.entries(c.threads).filter(([, viva]) => viva).length;
  const total = Object.keys(c.threads).length;
  const el = $("coletor");
  el.classList.toggle("erro", vivas < total);
  const amostras = c.amostras_hardware + c.amostras_containers + c.amostras_servicos;
  const graves = (c.eventos.atencao ?? 0) + (c.eventos.critico ?? 0);
  el.innerHTML = `<span class="ponto"></span>${vivas}/${total} threads ativas · buffer ${c.buffer_ocupado}/${c.buffer_capacidade}`
    + ` · ${amostras} amostras · ${c.amostras_perdidas} perdidas`
    + (graves ? `<span class="alertas">${selo(`${graves} alertas`, c.eventos.critico ? "critico" : "atencao")}</span>` : "");
}

// ------------------------------------------------------------- atualizar
async function buscar(caminho) {
  const r = await fetch(`api/${caminho}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

async function atualizar() {
  try {
    const [coletor, hardware, eventos] = await Promise.all([buscar("coletor"), buscar("nivel/hardware"), buscar("eventos?limite=100")]);
    desenharColetor(coletor);
    desenharHardware(hardware);
    desenharEventos(eventos, coletor.eventos);
    // Containers e serviços podem ainda não ter a 1ª amostra (404): não derrubam a tela 1.
    await Promise.all([
      buscar("nivel/containers").then(desenharContainers).catch(() => {}),
      buscar("nivel/servicos").then(desenharServicos).catch(() => {}),
    ]);
  } catch (erro) {
    const el = $("coletor");
    el.classList.add("erro");
    el.innerHTML = `<span class="ponto"></span>sem dados do coletor (${erro.message})`;
  }
}

// ------------------------------------------------------------------ abas
document.querySelectorAll(".abas button").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".abas button").forEach((b) => b.setAttribute("aria-selected", b === botao));
    document.querySelectorAll(".aba").forEach((s) => s.classList.toggle("ativa", s.id === `aba-${botao.dataset.aba}`));
  });
});

atualizar();
setInterval(atualizar, INTERVALO_MS);
