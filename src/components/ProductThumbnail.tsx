export function ProductThumbnail({ skuCode, name = "Product" }: { skuCode: string; name?: string }) {
  return <img src={`/api/product-thumbnail?sku=${encodeURIComponent(skuCode)}`} alt={name} width={48} height={48} loading="eager" className="mr-3 inline-block h-12 w-12 shrink-0 rounded border border-border-base bg-white object-contain align-middle print:h-10 print:w-10" />;
}
