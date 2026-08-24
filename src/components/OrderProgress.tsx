import { orderProgress } from "@/lib/order-progress";
import { TONES } from "@/lib/status-tone";

/**
 * Where an order has got to, drawn as the journey it is on.
 *
 * A status word on its own answers "what is it called" and not "when do I get
 * my gloves". The track answers the second: how far along, what is next, and
 * what is still to come. Cancelled leaves the track rather than colouring it,
 * because it is not a stage on the way to delivery.
 *
 * THE TRACK IS COLOURED BY STAGE, NOT BY STATE — the client's request of
 * 23 Aug 2026: red on arrival, orange while it is being prepared, light green
 * once it is moving, solid green when it lands. It reads as a thing ripening.
 *
 * That is a different question from the one the five tones answer, and it is
 * why the ramp is its own set of variables rather than a remapping of them. In
 * the tone system red means STOPPED, and status-tone.ts is deliberate that the
 * mapping is meaning rather than preference. A new order is not stopped; it is
 * at the beginning. Folding the two together would have made red mean both.
 *
 * THE WHOLE REACHED PORTION TAKES THE CURRENT STAGE'S COLOUR, rather than each
 * segment keeping its own. "Solid green as delivered" is the test: a delivered
 * order has to read green all the way across, and a fixed per-segment ramp
 * would have left it starting in red for ever.
 *
 * Colour is never the only carrier. Roughly one man in twelve cannot separate
 * red from green, so the current step is the only one in bold, it is the only
 * one with a glyph, and the stage is written out in words underneath.
 *
 * A server component — nothing here changes without a page load.
 */

/**
 * The ramp, in track order. Indexed by position rather than by status key so
 * that a track of a different length still gets a sensible colour, and the
 * last stage is always the settled green.
 */
const STAGES = [
  { bar: "bg-[var(--stage-1-bar)]", text: "text-[var(--stage-1-text)]" },
  { bar: "bg-[var(--stage-2-bar)]", text: "text-[var(--stage-2-text)]" },
  { bar: "bg-[var(--stage-3-bar)]", text: "text-[var(--stage-3-text)]" },
  { bar: "bg-[var(--stage-4-bar)]", text: "text-[var(--stage-4-text)]" },
] as const;

const stageAt = (index: number) =>
  STAGES[Math.min(index, STAGES.length - 1)] ?? STAGES[0]!;

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

  // Where the order actually is. "current" is the stage it sits in; an order
  // whose every step is done is delivered, so it takes the last stage.
  const currentIndex = Math.max(
    0,
    progress.steps.findIndex((step) => step.state === "current")
  );
  const stage = stageAt(
    progress.steps.some((step) => step.state === "current")
      ? currentIndex
      : progress.steps.length - 1
  );

  return (
    <div>
      <ol className="flex items-start gap-1" aria-label="Order progress">
        {progress.steps.map((step, index) => {
          const reached = step.state !== "todo";

          return (
            <li key={step.key} className="flex-1">
              {/* The bar carries how far along; the label says which stage.
                  Every reached segment wears the CURRENT stage's colour, so
                  the whole track moves through the ramp together. */}
              <span
                className={`block h-1.5 rounded-full print-tone ${
                  reached ? stage.bar : "bg-surface-sunken"
                }`}
                data-stage={reached ? currentIndex + 1 : undefined}
              />
              <span
                className={`mt-1.5 flex items-baseline gap-1 text-[11px] leading-tight ${
                  step.state === "current"
                    ? `font-bold ${stage.text}`
                    : reached
                      ? "font-medium text-text-muted"
                      : "text-text-subtle"
                }`}
              >
                {step.state === "current" && (
                  <>
                    <span className="sr-only">Currently: </span>
                    {/* The glyph still comes from the tone system: it says
                        "in progress" or "done", which is the thing colour
                        cannot say on a mono printer or to a reader who
                        cannot separate these hues. */}
                    <span aria-hidden="true">
                      {progress.closed ? TONES.complete.glyph : TONES.active.glyph}
                    </span>
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
