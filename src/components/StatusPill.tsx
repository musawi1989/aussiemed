import { TONES, statusMeaning, type Axis } from "@/lib/status-tone";

/**
 * One pill for every status in the business, so the same word never means two
 * different things in two places.
 *
 * The colours and the words live in `status-tone.ts`, which is pure and
 * tested. This file is only the shape they are drawn in.
 *
 * `axis` is required rather than guessed. Most status words are ambiguous on
 * their own — "Sent" is an email that has gone and a purchase order that has
 * not been acknowledged; "Pending" is an order waiting for the buying run and
 * a background job waiting its turn. Making the caller say which question it
 * is answering is what stops those quietly sharing a colour.
 */
export function StatusPill({
  status,
  axis,
  size = "normal",
}: {
  status: string;
  axis: Axis;
  /** `small` for dense tables where a full pill crowds the row. */
  size?: "normal" | "small";
}) {
  const meaning = statusMeaning(axis, status);
  const tone = TONES[meaning.tone];

  return (
    <span
      // The sentence is on the pill itself, so nobody has to learn the system
      // to use it — hovering "Backordered" says why it wants a person.
      title={meaning.meaning}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold ${
        size === "small" ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-0.5 text-xs"
      } ${tone.pill} print-tone`}
      data-tone={meaning.tone}
    >
      {/* Shape as well as colour: this is the only signal that survives a mono
          printer, or a reader who cannot separate red from green. */}
      <span aria-hidden="true" className="text-[0.9em] leading-none">
        {tone.glyph}
      </span>
      {meaning.label}
    </span>
  );
}

/**
 * The bare dot, for a table dense enough that a row of pills becomes stripes.
 * Same tones, same glyph, no fill.
 */
export function StatusDot({
  status,
  axis,
  withLabel = true,
}: {
  status: string;
  axis: Axis;
  withLabel?: boolean;
}) {
  const meaning = statusMeaning(axis, status);
  const tone = TONES[meaning.tone];

  return (
    <span className="inline-flex items-center gap-1.5" title={meaning.meaning}>
      <span
        aria-hidden="true"
        className={`text-xs leading-none ${tone.text} print-tone`}
        data-tone={meaning.tone}
      >
        {tone.glyph}
      </span>
      {withLabel && (
        <span className={`text-sm font-semibold ${tone.text}`}>
          {meaning.label}
        </span>
      )}
      {!withLabel && <span className="sr-only">{meaning.label}</span>}
    </span>
  );
}
