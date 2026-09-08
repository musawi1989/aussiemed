"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductThumb } from "./ProductThumb";

const Selection = createContext<{ sku: string; select: (sku: string) => void } | null>(null);
export function ProductSelection({ initialSku, children }: { initialSku: string; children: React.ReactNode }) {
  const [sku, select] = useState(initialSku);
  return <Selection.Provider value={{ sku, select }}>{children}</Selection.Provider>;
}
export function useSelectedProductPack() { return useContext(Selection); }
export function SelectedProductCode({ fallback }: { fallback: string }) {
  return <>{useSelectedProductPack()?.sku ?? fallback}</>;
}
export function ProductGallery({ product }: { product: Product }) {
  const selection = useSelectedProductPack();
  const packs = [...product.packs, ...product.combinations.flatMap(c => c.packs)];
  const pack = packs.find(pack => pack.sku === selection?.sku);
  const photos = pack?.images?.length ? pack.images : product.genericImages ?? product.images;
  const [index, setIndex] = useState(0);
  const key = photos.join("|");
  useEffect(() => { setIndex(0); }, [key]);
  const src = photos[index] ?? photos[0];
  return <div>
    <div className="flex aspect-[4/3] w-full items-center justify-center border border-border-base bg-surface">
      {src ? <img src={src} alt={product.name + (pack ? " - " + pack.label : "")} loading="eager" className="h-full w-full object-contain p-4" /> : <ProductThumb product={{ ...product, images: [] }} priority size="lg" className="h-full w-full" />}
    </div>
    {photos.length > 1 && <div className="mt-3 flex gap-3 overflow-auto">{photos.map((photo, i) => <button key={photo} type="button" aria-label={`Product photo ${i + 1}`} aria-pressed={i === index} onClick={() => setIndex(i)} className={`h-20 w-20 shrink-0 rounded-card border bg-surface p-1 ${i === index ? "border-navy" : "border-border-base"}`}><img src={photo} alt="" className="h-full w-full object-contain" /></button>)}</div>}
  </div>;
}
