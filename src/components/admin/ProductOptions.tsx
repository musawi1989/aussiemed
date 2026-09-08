"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addOptionAction,
  addValueAction,
  removeOptionAction,
  removeValueAction,
  setSkuOptionsAction,
} from "@/app/admin/products/[id]/option-actions";
import { Panel, type FormState } from "@/components/AdminForm";

export type OptionView = {
  id: string;
  name: string;
  values: { id: string; value: string; skuCount: number }[];
};

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs font-semibold text-text";

/**
 * What a product varies by, and the answers it offers.
 *
 * Values are chips rather than rows: a colour is two words, and forty of them
 * as a table is a screen you scroll to read something you could have taken in
 * at a glance. The count beside each is how many packs are that value, which
 * is also what decides whether it can be removed.
 */
export function ProductOptions({
  productId,
  slug,
  options,
}: {
  productId: string;
  slug: string;
  options: OptionView[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, submit, saving] = useActionState<FormState, FormData>(
    addOptionAction,
    null
  );
  const form = useRef<HTMLFormElement>(null);

  return (
    <Panel
      title="Variants"
      note="What this product varies by. The storefront builds its picker from these, and each pack holds one value per option."
    >
      {options.length === 0 ? (
        <p className="text-sm text-text-muted">
          This product does not vary. Add an option &mdash; Size, Colour &mdash;
          to make it a range.
        </p>
      ) : (
        <div className="space-y-4">
          {options.map((option) => (
            <OptionBlock
              key={option.id}
              productId={productId}
              slug={slug}
              option={option}
            />
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-border-base pt-3">
        {adding ? (
          <RestoringForm state={state} saveAll={true}
            ref={form}
            action={submit}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="slug" value={slug} />
            <label className="min-w-[10rem] flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
                What does it vary by?
              </span>
              <input
                name="name"
                required
                autoFocus
                placeholder="Size"
                className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="h-[38px] rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {saving ? "Adding…" : "Add option"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-[38px] rounded-card border border-border-strong bg-surface px-3 text-sm font-bold text-text hover:bg-surface-hover"
            >
              Cancel
            </button>
          </RestoringForm>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-bold text-navy hover:underline"
          >
            + Add an option
          </button>
        )}
        <Feedback state={state} />
      </div>
    </Panel>
  );
}

function OptionBlock({
  productId,
  slug,
  option,
}: {
  productId: string;
  slug: string;
  option: OptionView;
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    addValueAction,
    null
  );
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state?.ok || !state.newVariantId) return;
    const url = new URL(location.href);
    url.searchParams.set("newVariant", state.newVariantId);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [state, router]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-text">{option.name}</p>
        <RemoveOption
          productId={productId}
          slug={slug}
          optionId={option.id}
          name={option.name}
          inUse={option.values.reduce((n, v) => n + v.skuCount, 0)}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {option.values.map((value) => (
          <span key={value.id} className={chip}>
            {value.value}
            <span className="text-text-subtle tnum">{value.skuCount}</span>
            <RemoveValue
              productId={productId}
              slug={slug}
              valueId={value.id}
              value={value.value}
              skuCount={value.skuCount}
            />
          </span>
        ))}

        <RestoringForm state={state} saveAll={true}
          ref={form}
          action={submit}
          className="inline-flex items-center gap-1"
        >
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="optionId" value={option.id} />
          <input
            name="value"
            required
            placeholder={`New ${option.name.toLowerCase()}`}
            className="h-7 w-32 rounded-card border border-border-strong bg-surface px-2 text-xs text-text focus:border-navy focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="h-7 rounded-card border border-border-strong bg-surface px-2 text-xs font-bold text-navy hover:bg-surface-hover disabled:opacity-60"
          >
            {saving ? "…" : "Add"}
          </button>
        </RestoringForm>
      </div>
      <Feedback state={state} />
    </div>
  );
}

/** The number beside a value is how many packs it defines — and the reason. */
function RemoveValue({
  productId,
  slug,
  valueId,
  value,
  skuCount,
}: {
  productId: string;
  slug: string;
  valueId: string;
  value: string;
  skuCount: number;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    removeValueAction,
    null
  );

  if (skuCount > 0) {
    return (
      <span
        aria-hidden="true"
        title={`${skuCount} pack${skuCount === 1 ? " is" : "s are"} ${value}, so it cannot be removed until they are changed.`}
        className="cursor-help text-text-subtle"
      >
        &middot;
      </span>
    );
  }

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="inline">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="valueId" value={valueId} />
      <button
        type="submit"
        onClick={event => { if (!window.confirm(`Remove the unused variant value ${value}?`)) event.preventDefault(); }}
        disabled={pending}
        title={`Remove ${value}`}
        aria-label={`Remove ${value}`}
        className="text-danger hover:font-bold disabled:opacity-60"
      >
        ×
      </button>
      {state?.ok === false && (
        <span role="alert" className="ml-1 text-[11px] text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}

function RemoveOption({
  productId,
  slug,
  optionId,
  name,
  inUse,
}: {
  productId: string;
  slug: string;
  optionId: string;
  name: string;
  inUse: number;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    removeOptionAction,
    null
  );

  // Said instead of offered. An option every pack is defined by cannot go
  // until those packs stop being defined by it, and a button that always
  // refuses teaches people to distrust the ones that work.
  if (inUse > 0) {
    return (
      <span className="text-[11px] text-text-subtle tnum">
        {inUse} pack{inUse === 1 ? "" : "s"} defined by it
      </span>
    );
  }

  return (
    <RestoringForm state={state} saveAll={false} action={submit}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="optionId" value={optionId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (!window.confirm(`Remove the ${name} option and its values?`)) {
            event.preventDefault();
          }
        }}
        className="text-[11px] font-bold text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "…" : "Remove option"}
      </button>
      {state?.ok === false && (
        <span role="alert" className="ml-1 text-[11px] text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}

/**
 * Which one this pack is — a value per option, saved together.
 *
 * Sits inside the pack's own panel, because "the large blue one" is a fact
 * about this pack and not about the product. Saved in one go: setting size
 * and colour in two steps leaves a moment where the pack is a combination
 * that never existed.
 */
export function SkuVariant({
  productId,
  slug,
  skuId,
  options,
  chosen,
}: {
  productId: string;
  slug: string;
  skuId: string;
  options: OptionView[];
  /** Value ids this pack currently holds. */
  chosen: string[];
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    setSkuOptionsAction,
    null
  );
  const [selected, setSelected] = useState(chosen);
  const savedSelection = chosen.join("|");
  useEffect(() => { setSelected(chosen); }, [savedSelection]);

  if (options.length === 0) return null;

  const pick = (option: OptionView) =>
    option.values.find((v) => selected.includes(v.id))?.id ?? "";

  return (
    <RestoringForm state={state} saveAll={true} action={submit} className="mt-3 border-t border-border-base pt-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="skuId" value={skuId} />

      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        Which one this pack is
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        {options.map((option) => (
          <label key={option.id} className="block">
            <span className="block text-[11px] text-text-muted">{option.name}</span>
            <select
              name="valueId"
              value={pick(option)}
              onChange={event => {
                const value = event.currentTarget.value;
                setSelected(current => [...current.filter(id => !option.values.some(v => v.id === id)), ...(value ? [value] : [])]);
              }}
              className="mt-0.5 h-8 rounded-card border border-border-strong bg-surface px-2 text-sm text-text focus:border-navy focus:outline-none"
            >
              <option value="">&mdash;</option>
              {option.values.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.value}
                </option>
              ))}
            </select>
          </label>
        ))}

        <button
          type="submit"
          disabled={saving}
          className="h-8 rounded-card border border-border-strong bg-surface px-3 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save variant"}
        </button>
        <Feedback state={state} />
      </div>
    </RestoringForm>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false) {
    return (
      <p role="alert" className="mt-1 text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="mt-1 text-xs font-semibold text-success">
        {state.message}
      </p>
    );
  }
  return null;
}
