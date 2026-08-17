import { StatusPill } from "@/components/StatusPill";
import { TONES, legend, type Axis, type Tone } from "@/lib/status-tone";

/**
 * The colour system, written down where a person can read it.
 *
 * A convention nobody can look up is not a convention, it is a habit — and the
 * first time somebody adds a screen without knowing the rule, the rule is
 * gone. This is the one page that says what the colours mean, so a new member
 * of staff can learn it in a minute and a developer has somewhere to check
 * before inventing a sixth tone.
 *
 * It is generated from the same tables the pills read, so it cannot describe a
 * system other than the one actually running.
 */

const AXES: { axis: Axis; title: string; question: string }[] = [
  {
    axis: "fulfilment",
    title: "Fulfilment",
    question: "Where are the goods?",
  },
  {
    axis: "delivery",
    title: "Delivery",
    question: "Where is the parcel?",
  },
  {
    axis: "payment",
    title: "Payment",
    question: "Have we been paid?",
  },
];

const TONE_ORDER: Tone[] = [
  "resting",
  "active",
  "attention",
  "complete",
  "stopped",
];

export function StatusLegend() {
  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">
        What the status colours mean
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        The same five colours everywhere. A colour says how concerned to be, not
        which part of the business a word belongs to — so green always means
        finished, amber always means somebody has to do something, and red
        always means stopped or late. Each carries a shape as well, which is
        what survives a black-and-white printer.
      </p>

      {/* The five tones themselves, before the words that use them. */}
      <ul className="mt-4 space-y-1.5">
        {TONE_ORDER.map((tone) => (
          <li key={tone} className="flex items-baseline gap-2.5 text-xs">
            <span
              aria-hidden="true"
              className={`w-4 shrink-0 text-center font-bold ${TONES[tone].text}`}
            >
              {TONES[tone].glyph}
            </span>
            <span className="text-text-muted">{TONES[tone].meaning}</span>
          </li>
        ))}
      </ul>

      {/* An order carries three of these at once, and they can disagree. */}
      <div className="mt-5 space-y-4">
        {AXES.map(({ axis, title, question }) => (
          <div key={axis}>
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              {title}
              <span className="ml-2 font-semibold normal-case tracking-normal text-text-muted">
                {question}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {legend(axis).map((entry) => (
                <StatusPill
                  key={entry.key}
                  status={entry.key}
                  axis={axis}
                  size="small"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-border-base pt-3 text-xs leading-relaxed text-text-subtle">
        The three are kept apart on purpose. An order can be delivered and
        overdue at the same time, and that pairing is the one worth acting on —
        it only stands out if both are on screen. Hover any pill to read what it
        means.
      </p>
    </section>
  );
}
