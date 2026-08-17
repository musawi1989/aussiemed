import { orderProgress } from "@/lib/order-progress";
import { TONES, type Tone } from "@/lib/status-tone";

/**
 * Where an order has got to, drawn as the journey it is on.
 *
 * A status word on its own answers "what is it called" and not "when do I get
 * my gloves". The track answers the second: how far along, what is next, and
 * what is still to come. Cancelled leaves the track rather than colouring it,
 * because it is not a stage on the way to delivery.
 *
 * The track used to be navy from end to end, which made it a picture of
 * position and not of health — a delivered order and one sitting in a
 * warehouse looked the same colour. It now reads in the same five tones as
 * every pill on the site: green behind, blue where it is now, grey ahead, red
 * if it stopped. Somebody who has learned the colours on the orders list can
 * read this without learning anything else.
 *
 * A server component — nothing here changes without a page load.
 */
export function OrderProgress({
  status,
  compact = false,
}: {
  status: string;
  /** The list variant: the track only, without the explanatory sentence. */
  compact?: boolean;
}) {
  const progress = orderProgress(status);

  if (progress.cancelled) {
    const stopped = TONES.stopped;
    return (
      <div className="rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5 print-tone">
        <p className="flex items-center gap-1.5 text-sm font-bold text-danger">
          <span aria-hidden="true">{stopped.glyph}</span>
          {progress.headline}
        </p>
        {!compact && (
          <p className="mt-0.5 text-sm text-text-muted">{progress.detail}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <ol className="flex items-start gap-1" aria-label="Order progress">
        {progress.steps.map((step, index) => {
          /**
           * Behind is finished, here is moving, ahead is nothing yet. The last
           * step is the exception: once an order is delivered "here" is not
           * in progress, it is done, and drawing it blue would suggest
           * something is still to come.
           */
          const tone: Tone =
            step.state === "done"
              ? "complete"
              : step.state === "current"
                ? progress.closed
                  ? "complete"
                  : "active"
                : "resting";

          const reached = step.state !== "todo";

          return (
            <li key={step.key} className="flex-1">
              {/* The bar carries the progress; the label says which stage.
                  Colour alone would not do it — the current step is the only
                  one in bold, and the tone's own glyph sits beside it. */}
              <span
                className={`block h-1.5 rounded-full print-tone ${
                  reached ? TONES[tone].rail : "bg-surface-sunken"
                }`}
                data-tone={tone}
              />
              <span
                className={`mt-1.5 flex items-baseline gap-1 text-[11px] leading-tight ${
                  step.state === "current"
                    ? `font-bold ${TONES[tone].text}`
                    : reached
                      ? "font-medium text-text-muted"
                      : "text-text-subtle"
                }`}
              >
                {step.state === "current" && (
                  <>
                    <span className="sr-only">Currently: </span>
                    <span aria-hidden="true">{TONES[tone].glyph}</span>
                  </>
                )}
                <span>{step.label}</span>
                {index === 0 && step.state === "todo" && (
                  <span className="sr-only"> — not yet reached</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {!compact && (
        <p className="mt-2.5 text-sm text-text-muted">{progress.detail}</p>
      )}
    </div>
  );
}
