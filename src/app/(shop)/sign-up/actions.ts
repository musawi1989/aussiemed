"use server";

import {
  applyForAccount,
  resendOtp,
  verifyEmail,
} from "@/lib/applications";
import type { FormState } from "@/components/AdminForm";

/**
 * Thin: read the form, hand it to the service layer, translate the Result.
 * Every rule lives in registration.ts and applications.ts, because a server
 * action is a public endpoint and the form is not what protects it.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function applyAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await applyForAccount({
    companyName: text(data, "companyName"),
    trn: text(data, "trn"),
    contactName: text(data, "contactName"),
    email: text(data, "email"),
    phone: text(data, "phoneNational"),
    phoneNational: text(data, "phoneNational"),
    countryCode: text(data, "countryCode"),
    password: String(data.get("password") ?? ""),
  });

  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    message: `check-email:${result.value.email}`,
  };
}

export async function verifyAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await verifyEmail({
    email: text(data, "email"),
    code: text(data, "code"),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: "verified" };
}

export async function resendAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  await resendOtp(text(data, "email"));
  // Always the same answer, whether or not the address exists — otherwise this
  // is a way to find out which addresses have accounts.
  return {
    ok: true,
    message: "If that address is waiting to be confirmed, a new code is on its way.",
  };
}
