export type LogoKind = "supplier" | "organisation" | "user";
export function EntityLogo({ kind = "organisation", id, name = "Company" }: { kind?: LogoKind; id?: string | null; name?: string }) {
  return <img src={id ? `/api/entity-logo/${kind}/${encodeURIComponent(id)}` : "/entity-placeholder.svg"} alt={`${name} logo`} width={40} height={40} className="mr-3 inline-block h-10 w-10 shrink-0 rounded border border-border-base bg-white object-contain align-middle" />;
}
