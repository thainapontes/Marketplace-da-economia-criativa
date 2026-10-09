import type { Produto } from "@/types/produto";
import ProductCard from "./ProductCard";
import EmptyState from "@/components/feedback/EmptyState";

interface ProductListProps {
  produtos: Produto[];
  titulo?: string;
  descricao?: string;
  /** Precisa ser único quando houver mais de uma lista na mesma página. */
  id?: string;
}

export default function ProductList({ produtos, titulo = "Escolhas da semana", descricao, id = "produtos-destaque" }: ProductListProps) {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-12 md:py-24" aria-labelledby={id}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label">Peças com origem</p>
          <h2 id={id} className="mt-2 font-display text-4xl text-[#2C2C2C]">
            {titulo}
          </h2>
        </div>
        {descricao && <p className="max-w-sm text-sm leading-6 text-[#888]">{descricao}</p>}
      </div>
      {produtos.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {produtos.map((produto) => (
            <ProductCard key={produto.id} produto={produto} />
          ))}
        </div>
      ) : (
        <EmptyState titulo="Nenhum produto disponível" mensagem="Novas peças chegam em breve." />
      )}
    </section>
  );
}
