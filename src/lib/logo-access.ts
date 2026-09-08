/** Account ownership checks; administrator permissions are checked separately. */
export function canEditOwnLogo(user: { role: string; id: string; supplierId?: string | null; organisationId?: string | null }, kind: string, id: string): boolean {
  if (!id) return false;
  if (user.role === "Supplier") return kind === "supplier" && user.supplierId === id;
  if (user.role === "Customer") return (kind === "organisation" && user.organisationId === id) || (kind === "user" && user.id === id);
  return false;
}
