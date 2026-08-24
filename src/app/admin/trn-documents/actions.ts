"use server";

import { revalidatePath } from "next/cache";
import {
  isTrnHolder,
  putTrnDocument,
  removeTrnDocument,
  type TrnHolder,
} from "@/lib/trn-documents";
import type { FormState } from "@/components/AdminForm";

/**
 * Uploading and removing a TRN certificate, for suppliers and for customer
 * accounts alike.
 *
 * ONE PAIR OF ACTIONS FOR BOTH, rather than a pair per holder. The rules are
 * identical — an admin, a file, one document per record — and two copies would
 * drift, which is the same reasoning that gives SupplierForm and CustomerForm
 * one shape each for create and edit.
 *
 * The holder kind arrives in the form and is checked against a closed list
 * before it reaches the service. It is a value from the page, not a value from
 * a person, but it selects a database table and that is not a thing to take on
 * trust from a request body.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** The two fields every one of these posts, validated together. */
function target(
  data: FormData
): { ok: true; kind: TrnHolder; id: string } | { ok: false; error: string } {
  const kind = text(data, "kind");
  const id = text(data, "id");

  if (!isTrnHolder(kind)) return { ok: false, error: "That is not a record we hold documents for." };
  if (!id) return { ok: false, error: "That record no longer exists." };

  return { ok: true, kind, id };
}

/** Where the change needs to be visible afterwards. */
function refresh(kind: TrnHolder, id: string) {
  revalidatePath(kind === "supplier" ? `/admin/suppliers/${id}` : `/admin/customers/${id}`);
}

export async function uploadTrnDocumentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const where = target(data);
  if (!where.ok) return { ok: false, error: where.error };

  const file = data.get("document");
  // An empty file input still posts a File — with no name and no bytes. That
  // is somebody pressing Upload without choosing anything, which deserves the
  // obvious sentence rather than "that file is empty".
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file first." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await putTrnDocument(where.kind, where.id, { name: file.name, bytes });
  if (!result.ok) return { ok: false, error: result.error };

  refresh(where.kind, where.id);
  return { ok: true, message: "Document saved." };
}

export async function removeTrnDocumentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const where = target(data);
  if (!where.ok) return { ok: false, error: where.error };

  const result = await removeTrnDocument(where.kind, where.id);
  if (!result.ok) return { ok: false, error: result.error };

  refresh(where.kind, where.id);
  return { ok: true, message: "Document removed." };
}
