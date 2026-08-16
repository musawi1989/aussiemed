import { orderProgress } from "@/lib/order-progress";

/**
 * Where an order has got to, drawn as the journey it is on.
 *
 * A status word on its own answers "what is it called" and not "when do I get
 * my gloves". The track answers the second: how far along, what is next, and
 * what is still to come. Cancelled leaves the track rather than colouring it,
 * because it is not a stage on the way to delivery.
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
    return (
      <div className="rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5">
        <p className="text-sm font-bold text-danger">{progress.headline}</p>
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
          const reached = step.state !== "todo";
          return (
            <li key={step.key} className="flex-1">
              {/* The bar carries the progress; the dot marks where you are.
                  Colour alone would not say it, so the current step is also
                  the only one in bold. */}
              <span
                className={`block h-1.5 rounded-full ${
                  reached ? "bg-navy" : "bg-surface-sunken"
                }`}
              />
              <span
                className={`mt-1.5 block text-[11px] leading-tight ${
                  step.state === "current"
                    ? "font-bold text-navy"
                    : reached
                      ? "font-medium text-text-muted"
                      : "text-text-subtle"
                }`}
              >
                {step.state === "current" && (
                  <span className="sr-only">Currently: </span>
                )}
                {step.label}
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
