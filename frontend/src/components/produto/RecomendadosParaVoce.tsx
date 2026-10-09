"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { recomendacoesService } from "@/services/api/recomendacoes.service";
import type { Produto } from "@/types/produto";
import ProductList from "./ProductList";

/**
 * RF-06: seção da página inicial com recomendações para o comprador logado. Visitantes,
 * artesãos e administradores não veem a seção; lista vazia também a esconde (RF-08).
 */
export default function RecomendadosParaVoce() {
  const { usuario } = useAuth();
  const [recomendados, setRecomendados] = useState<Produto[]>([]);
  const comprador = usuario?.perfil === "comprador" ? usuario : null;

  useEffect(() => {
    setRecomendados([]);
    if (!comprador) return;
    let ativo = true;
    recomendacoesService
      .recomendarParaUsuario(comprador.id, comprador.email, 4)
      .then((resultado) => ativo && setRecomendados(resultado));
    return () => {
      ativo = false;
    };
  }, [comprador?.id, comprador?.email]);

  if (!comprador || recomendados.length === 0) return null;

  return (
    <ProductList
      id="recomendados-para-voce"
      produtos={recomendados}
      titulo={`Escolhidos para você, ${comprador.nome.split(" ")[0]}`}
      descricao="Sugestões a partir das suas compras e das peças mais procuradas no Origem."
    />
  );
}
