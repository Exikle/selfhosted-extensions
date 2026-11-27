/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

const realClock = (): number => Date.now();
let clock = realClock;

// Every cache reads time here, so a test can move it.
export const cacheNow = (): number => clock();
export const setCacheClock = (now?: () => number): void => {
  clock = now ?? realClock;
};
