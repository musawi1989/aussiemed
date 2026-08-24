"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The filter's own scroll area, opened on the branch the buyer is inside.
 *
 * The category tree is 445 entries and a department can be fifty rows tall once
 * it is open, so arriving from a front-page tile used to land you at the top of
 * an alphabetical list with the thing you actually chose somewhere below the
 * fold. This scrolls its own box — not the page — so the chosen branch starts at
 * the top of the box the moment the screen paints.
 *
 * THE OPEN DEPARTMENT GOES TO THE TOP, not the active row itself. Dental is the
 * fourteenth of fourteen departments and carries 24 shelves: merely having its
 * row in view — which it already was, being only thirteen rows down — left every
 * one of those shelves past the bottom edge, so the buyer arriving from the
 * front-page tile saw thirteen departments they had not asked for and none of
 * the one they had. Pinning the department puts the branch they chose in the
 * box, in order, from the top.
 *
 * Deliberately scrollTop rather than scrollIntoView: the latter scrolls every
 * ancestor that can scroll, which on a sticky sidebar drags the whole page down
 * and away from the products the buyer came to see.
 *
 * Measured with getBoundingClientRect rather than offsetTop, because the tree is
 * three deep now and offsetTop is relative to whichever ancestor happens to be
 * positioned, not to the box being scrolled.
 */
export function FilterScroll({
  activeCategory,
  children,
}: {
  activeCategory?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);

  // Keyed on the category alone: ticking a brand or dragging the price re-renders
  // this panel too, and a box that jumps every time a filter changes is worse
  // than one that never moves.
  useEffect(() => {
    const container = box.current;
    if (!container) return;

    const offsetIn = (el: HTMLElement) =>
      el.getBoundingClientRect().top - container.getBoundingClientRect().top;

    const branch = container.querySelector<HTMLElement>("[data-branch='open']");
    if (!branch) {
      container.scrollTop = 0;
      return;
    }

    container.scrollTop += offsetIn(branch);

    // A deep shelf — Dental > Endodontics > Hand Files — can fall below the
    // bottom edge once its department is pinned. Give up the top position, but
    // only by as much as it takes to show what the buyer actually chose.
    const active = container.querySelector<HTMLElement>("[data-active='true']");
    if (!active) return;

    const overshoot =
      offsetIn(active) + active.offsetHeight - container.clientHeight;
    if (overshoot > 0) container.scrollTop += overshoot;
  }, [activeCategory]);

  return (
    <div
      ref={box}
      className="max-h-[70vh] overflow-y-auto overscroll-contain px-4 py-4 lg:max-h-[calc(100vh-12rem)]"
    >
      {children}
    </div>
  );
}
