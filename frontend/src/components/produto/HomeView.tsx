"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProdutos } from "@/hooks/useProdutos";
import { useArtesoes } from "@/hooks/useArtesoes";
import { CATEGORIAS } from "@/constants/categorias";
import { ROTAS } from "@/constants/rotas";
import ArtisanCard from "@/components/artesao/ArtisanCard";
import ProductList from "./ProductList";
import RecomendadosParaVoce from "./RecomendadosParaVoce";
import LoadingState from "@/components/feedback/LoadingState";
import ErrorState from "@/components/feedback/ErrorState";

const CATEGORIA_TODOS = "Todos";
const categoriasFiltro = [CATEGORIA_TODOS, ...CATEGORIAS];

export default function HomeView() {
  const [categoria, setCategoria] = useState(CATEGORIA_TODOS);
  const { produtos, carregando, erro, recarregar } = useProdutos();
  const { artesoes, carregando: carregandoArtesoes } = useArtesoes();

  const filtrados = useMemo(
    () => (categoria === CATEGORIA_TODOS ? produtos : produtos.filter((produto) => produto.categoria === categoria)),
    [produtos, categoria],
  );

  return (
    <div className="bg-[#FBF8F4]">
      <section className="relative flex min-h-[90vh] items-center overflow-hidden bg-[#1B4332]">
        <div className="absolute inset-0 bg-cover bg-center opacity-[.18]" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=1600&h=900&fit=crop&auto=format)" }} />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(27,67,50,.95)_0%,rgba(193,82,42,.4)_100%)]" />
        <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6">
          <div className="max-w-[720px]">
            <h1 className="font-display text-[clamp(3rem,7vw,6rem)] leading-[1.05] tracking-[-.025em] text-white">
              Arte que carrega
              <br />
              <em className="text-[#C1522A]">a alma do sertão.</em>
            </h1>
            <p className="mb-10 mt-6 max-w-[520px] text-lg leading-[1.8] text-white/70">
              Descubra peças únicas criadas por mestres artesãos de Pernambuco. Do Alto do Moura a Olinda, cada peça conta uma história de séculos.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href={ROTAS.produtos} className="btn-primary">
                Explorar Coleção <span aria-hidden="true">→</span>
              </Link>
              <Link href={ROTAS.artesoes} className="btn-outline border-white/40 text-white hover:bg-white hover:text-[#1B4332]">
                Conhecer Artesãos
              </Link>
            </div>
            <div className="mt-14 flex flex-wrap gap-8">
              {[
                [`${artesoes.length || "—"}`, "Artesãos Cadastrados"],
                [`${produtos.length || "—"}`, "Peças Disponíveis"],
                ["4.9★", "Avaliação Média"],
              ].map(([valor, label]) => (
                <div key={label}>
                  <div className="font-display text-[2rem] font-semibold leading-none text-[#C1522A]">{valor}</div>
                  <div className="mt-1 text-[.8125rem] text-white/50">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hide-mobile absolute right-[5%] top-1/2 z-10 max-w-[260px] -translate-y-1/2 rounded bg-white/[.08] p-6 backdrop-blur-md">
          <img src="https://images.unsplash.com/photo-1786507244330-6ad954c96ef9?w=500&h=400&fit=crop&auto=format" alt="Cerâmica pernambucana em destaque" className="mb-4 h-[180px] w-full rounded-sm object-cover" />
          <p className="text-[.8125rem] text-white/50">Destaque da semana</p>
          <p className="font-display text-base font-medium text-white">Cerâmica Alto do Moura</p>
          <p className="mt-2 text-sm font-semibold text-[#C1522A]">A partir de R$ 185,00</p>
        </div>
      </section>

      <section className="sticky top-[68px] z-40 border-b border-[#E8E0D5] bg-white">
        <div className="mx-auto max-w-[1440px] overflow-x-auto px-6 py-3">
          <div className="flex gap-2">
            {categoriasFiltro.map((item) => (
              <button type="button" key={item} onClick={() => setCategoria(item)} className={`filter-pill ${categoria === item ? "active" : ""}`}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-6 pt-16">
        {carregando && <LoadingState variante="grid" itens={8} mensagem="Carregando produtos..." />}
        {!carregando && erro && <ErrorState mensagem={erro} onTentarNovamente={recarregar} />}
      </div>
      <RecomendadosParaVoce />
      {!carregando && !erro && <ProductList produtos={filtrados} titulo="Peças únicas para levar para casa" />}

      <section className="bg-[#1B4332]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-20 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="section-label mb-6 text-[#C1522A]">Nossa Missão</p>
            <h2 className="font-display text-[clamp(2rem,4vw,3.5rem)] font-normal leading-[1.1] tracking-[-.02em] text-white">Preservando a cultura através do comércio justo</h2>
            <p className="mt-6 text-base leading-[1.85] text-white/65">
              O Origem nasceu da convicção de que o artesanato pernambucano merece o mesmo palco que qualquer produto do design contemporâneo. Conectamos mestres artesãos do Agreste, Sertão, Zona da Mata e Grande Recife a consumidores que entendem o valor do feito à mão.
            </p>
            <p className="mt-6 text-base leading-[1.85] text-white/65">Cada compra representa renda direta para o artesão, sem intermediários desnecessários. Garantimos rastreabilidade, autenticidade e um preço justo pelo trabalho de décadas.</p>
            <Link href={ROTAS.artesoes} className="btn-primary mt-10">
              Conheça os Artesãos
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <img src="https://images.unsplash.com/photo-1641338215253-9e9c8cf48a5a?w=600&h=700&fit=crop&auto=format" alt="Artesã criando esculturas de barro" className="row-span-2 h-[320px] w-full rounded object-cover" />
            <img src="https://images.unsplash.com/photo-1655138493602-49901f93d250?w=400&h=300&fit=crop&auto=format" alt="Esculturas em madeira" className="h-[152px] w-full rounded object-cover" />
            <img src="https://images.unsplash.com/photo-1659644569209-1c397e64f7c6?w=400&h=300&fit=crop&auto=format" alt="Artesão trabalhando" className="h-[152px] w-full rounded object-cover" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-16">
        <p className="section-label mb-2">Mestres Artesãos</p>
        <h2 className="font-display text-[2rem] font-normal tracking-[-.02em]">Conheça quem faz acontecer</h2>
        {carregandoArtesoes ? (
          <div className="mt-10">
            <LoadingState variante="grid" itens={4} mensagem="Carregando artesãos..." />
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
            {artesoes.map((artesao) => (
              <ArtisanCard key={artesao.id} artesao={artesao} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-[#C1522A] px-6 py-20 text-center">
        <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal tracking-[-.02em] text-white">Você é artesão pernambucano?</h2>
        <p className="mb-8 mt-4 text-[1.0625rem] text-white/75">Cadastre-se no Origem e leve seu trabalho para o mundo inteiro.</p>
        <Link href={ROTAS.cadastro} className="btn-outline border-white text-white hover:bg-white hover:text-[#C1522A]">
          Criar Meu Painel de Artesão
        </Link>
      </section>
    </div>
  );
}
