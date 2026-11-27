/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { cacheNow } from "./clock";
import type { SeriesDto } from "./models";

export const SERIES_CACHE_TTL_MS = 5 * 60 * 1000;

// Home rows and the title page both need a series, so one lookup serves both. It lives for the
// JS session only; the extension has no pull-to-refresh hook, hence the short TTL.
const entries = new Map<string, { series: SeriesDto; at: number }>();

const keyOf = (baseUrl: string, seriesId: string): string => `${baseUrl}\n${seriesId}`;

export function getCachedSeries(baseUrl: string, seriesId: string): SeriesDto | undefined {
  const key = keyOf(baseUrl, seriesId);
  const entry = entries.get(key);
  if (entry === undefined) return undefined;
  if (cacheNow() - entry.at >= SERIES_CACHE_TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  return entry.series;
}

export const cacheSeries = (baseUrl: string, seriesId: string, series: SeriesDto): void => {
  entries.set(keyOf(baseUrl, seriesId), { series, at: cacheNow() });
};

export const clearSeriesCache = (): void => entries.clear();
