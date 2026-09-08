"use client";

/**
 * A submit button that asks first.
 *
 * Six controls in the back office deleted something permanently on one click,
 * with nothing between the pointer and the loss: a product photograph and its
 * file, a safety data sheet and its file, a customer's negotiated price, their
 * TRN certificate, a branch, a member of staff. None of it is recoverable and
 * none of it warned. Two other controls already confirmed — removing empty
 * categories, and one on purchasing — so the pattern existed and simply had
 * not been applied.
 *
 * ONE COMPONENT RATHER THAN SIX DIALOGUES. The question a person is asked
 * before losing something should read the same everywhere, and a message
 * written six times is written six ways.
 *
 * window.confirm, not a styled modal, and deliberately. It cannot be dismissed
 * by a stray click outside it, it is announced properly by a screen reader,
 * and it works identically on a phone. A prettier dialogue here would be a
 * worse one.
 */
export function ConfirmSubmit({
  /** What is being removed, named. "Safety data sheet". */
  what,
  /** What it costs, in one line. Shown under the question. */
  consequence,
  label = "Remove",
  pendingLabel = "Working…",
  pending = false,
  className = "",
}: {
  what: string;
  consequence: string;
  label?: string;
  pendingLabel?: string;
  pending?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        // Cancelling must stop the form, not merely the button's own default.
        if (!window.confirm(`Remove ${what}?\n\n${consequence}\n\nThis cannot be undone.`)) {
          event.preventDefault();
        }
      }}
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
