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

function desenharColetor(c) {
  const vivas = Object.entries(c.threads).filter(([, viva]) => viva).length;
  const total = Object.keys(c.threads).length;
  const el = $("coletor");
  el.classList.toggle("erro", vivas < total);
  el.innerHTML = `<span class="ponto"></span>${vivas}/${total} threads ativas · buffer ${c.buffer_ocupado}/${c.buffer_capacidade}`
    + ` · ${c.amostras_hardware} amostras · ${c.amostras_perdidas} perdidas`;
}

// ------------------------------------------------------------- atualizar
async function buscar(caminho) {
  const r = await fetch(`api/${caminho}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

async function atualizar() {
  try {
    const [coletor, hardware] = await Promise.all([buscar("coletor"), buscar("nivel/hardware")]);
    desenharColetor(coletor);
    desenharHardware(hardware);
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
