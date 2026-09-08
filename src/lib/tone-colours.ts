import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { TONES, type Tone } from "./status-tone";

/**
 * Letting an admin choose the five status colours.
 *
 * The colours are set as CSS variables on the document rather than stored
 * against each component, which is what makes this possible at all: one
 * declaration changes every pill, rail, dot and progress bar at once, and
 * nothing needs to know it happened.
 *
 * They are their own variables — not --success and --danger — because those are
 * shared with buttons, form errors and links. Recolouring "needs attention"
 * would otherwise repaint every amber button on the site, which is not what
 * anybody means by changing a status colour.
 *
 * What is deliberately NOT configurable is which status gets which tone. That
 * mapping is the meaning — amber is "somebody must act" — and letting it be
 * edited would let an overdue invoice be made green, which is not a preference,
 * it is a way to hide a problem.
 */

export const TONE_ORDER: Tone[] = [
  "resting",
  "active",
  "attention",
  "complete",
  "stopped",
];

export type ToneColour = {
  tone: Tone;
  /** What it is called on screen. */
  label: string;
  /** The chosen hex, or null when it is still the theme's own. */
  chosen: string | null;
  /** What it falls back to, for the picker to open on something sensible. */
  fallback: string;
  meaning: string;
  glyph: string;
};

/**
 * The built-in values, repeated here for the colour input to open on.
 *
 * A colour input cannot show `var(--success)`; it needs a hex. These are the
 * light-theme tokens from globals.css. They are a starting point for the
 * picker only — leave a tone unset and the real token is used, including its
 * dark-mode variant.
 */
const FALLBACK: Record<Tone, string> = {
  resting: "#666666",
  active: "#29387d",
  attention: "#9a5b12",
  complete: "#146c43",
  stopped: "#c9161b",
};

const LABEL: Record<Tone, string> = {
  resting: "Nothing happening",
  active: "In progress",
  attention: "Needs attention",
  complete: "Finished",
  stopped: "Stopped or late",
};

const key = (tone: Tone) => `toneColour.${tone}`;

/** Six-digit hex only. A colour input gives exactly this, and nothing else is
 * safe to interpolate into a stylesheet. */
const HEX = /^#[0-9a-f]{6}$/i;

export async function toneColours(): Promise<ToneColour[]> {
  const rows = await db.setting.findMany({
    where: { key: { in: TONE_ORDER.map(key) } },
    select: { key: true, value: true },
  });
  const chosen = new Map(rows.map((r) => [r.key, r.value]));

  return TONE_ORDER.map((tone) => {
    const value = chosen.get(key(tone)) ?? "";
    return {
      tone,
      label: LABEL[tone],
      chosen: HEX.test(value) ? value.toLowerCase() : null,
      fallback: FALLBACK[tone],
      meaning: TONES[tone].meaning,
      glyph: TONES[tone].glyph,
    };
  });
}

/**
 * The style block that applies the choices.
 *
 * Only tones that have actually been set are emitted, so an untouched site
 * keeps its own tokens and its dark mode. Values are re-validated here rather
 * than trusted from the database: this string goes into a <style> element, and
 * a stored value is not a safe one just because it was stored by us.
 *
 * The soft background is derived rather than asked for. Nobody wants to pick
 * ten colours, and a chosen ink with a hand-picked background is how you get an
 * unreadable pair — `color-mix` keeps the tint tied to the ink it sits behind.
 */
export async function toneStyleBlock(): Promise<string | null> {
  const colours = await toneColours();
  const set = colours.filter((c) => c.chosen !== null);
  if (set.length === 0) return null;

  const lines = set.flatMap((c) => {
    const hex = c.chosen!;
    if (!HEX.test(hex)) return [];
    return [
      `--tone-${c.tone}: ${hex};`,
      `--tone-${c.tone}-soft: color-mix(in srgb, ${hex} 12%, var(--surface));`,
    ];
  });

  return lines.length > 0 ? `:root{${lines.join("")}}` : null;
}

export async function setToneColour(
  tone: string,
  value: string
): Promise<Result> {
  const actor = await requireAdmin("settings");

  if (!TONE_ORDER.includes(tone as Tone)) {
    return { ok: false, error: "That is not one of the five status colours." };
  }

  const clean = value.trim().toLowerCase();
  // Blank means "put it back", which is the escape hatch from a bad choice.
  const reset = clean === "";
  if (!reset && !HEX.test(clean)) {
    return { ok: false, error: "Give a colour as a six-digit hex, like #146c43." };
  }

  const settingKey = key(tone as Tone);
  if (reset) {
    await db.setting.deleteMany({ where: { key: settingKey } });
  } else {
    await db.setting.upsert({
      where: { key: settingKey },
      update: { value: clean },
      create: { key: settingKey, value: clean },
    });
  }

  await audit(actor, "settings.toneColour", "Setting", settingKey, undefined, {
    tone,
    value: reset ? null : clean,
  });

  return { ok: true, value: undefined };
}
