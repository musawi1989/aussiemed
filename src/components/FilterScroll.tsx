"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The filter's own scroll area, opened at whatever the buyer clicked.
 *
 * The category tree is 445 entries and a department can be fifty rows tall once
 * it is open, so arriving from a front-page tile used to land you at the top of
 * an alphabetical list with the thing you actually chose somewhere below the
 * fold. This scrolls its own box — not the page — so the chosen category is in
 * view the moment the screen paints.
 *
 * Deliberately scrollTop rather than scrollIntoView: the latter scrolls every
 * ancestor that can scroll, which on a sticky sidebar drags the whole page down
 * and away from the products the buyer came to see.
 */
export function FilterScroll({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = box.current;
    if (!container) return;

    const active = container.querySelector<HTMLElement>("[data-active='true']");
    if (!active) {
      container.scrollTop = 0;
      return;
    }

    // Above the fold already: leave it alone rather than shuffling the list
    // under somebody who can see what they picked.
    const top = active.offsetTop - container.offsetTop;
    const bottom = top + active.offsetHeight;
    const visible = top >= container.scrollTop && bottom <= container.scrollTop + container.clientHeight;
    if (visible) return;

    // A third of the way down, so the shelves under an open category are
    // visible too rather than the chosen row sitting at the very bottom.
    container.scrollTop = Math.max(0, top - container.clientHeight / 3);
  }, []);

  return (
    <div
      ref={box}
      className="max-h-[70vh] overflow-y-auto overscroll-contain px-4 py-4 lg:max-h-[calc(100vh-12rem)]"
    >
      {children}
    </div>
  );
}
