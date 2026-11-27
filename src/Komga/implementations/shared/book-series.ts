/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { KomgaHttpError, komgaFetch } from "../../services/network";
import { isHiddenSeries } from "./filters";
import type { BookDto, SeriesDto } from "./models";
import { cacheSeries, getCachedSeries } from "./series-cache";
import { getBaseUrl, getIncludeOneshots } from "./state";
import { mapPool } from "./utils";

const SERIES_LOOKUPS_IN_FLIGHT = 6;

// A series that Komga says is gone (404) is left out; any other error fails the lookup.
async function fetchSeries(baseUrl: string, seriesId: string): Promise<SeriesDto | undefined> {
  const cached = getCachedSeries(baseUrl, seriesId);
  if (cached !== undefined) return cached;
  try {
    // seriesId is a book-only search condition, so series/list cannot look series up by id.
    const series = await komgaFetch<SeriesDto>(`/api/v1/series/${seriesId}`);
    cacheSeries(baseUrl, seriesId, series);
    return series;
  } catch (err) {
    if (err instanceof KomgaHttpError && err.status === 404) return undefined;
    throw err;
  }
}

// One lookup serves both the hidden-genre check and the content rating.
export async function resolveBookSeries(books: BookDto[]): Promise<{
  visible: BookDto[];
  seriesById: Map<string, SeriesDto>;
  pairs: { book: BookDto; series: SeriesDto }[];
}> {
  if (books.length === 0) return { visible: [], seriesById: new Map(), pairs: [] };

  const baseUrl = getBaseUrl();
  const seriesIds = [...new Set(books.map((b) => b.seriesId))];
  const found = await mapPool(seriesIds, SERIES_LOOKUPS_IN_FLIGHT, (id) =>
    fetchSeries(baseUrl, id),
  );
  const seriesById = new Map<string, SeriesDto>();
  found.forEach((series, index) => {
    if (series !== undefined) seriesById.set(seriesIds[index]!, series);
  });

  const includeOneshots = getIncludeOneshots();
  const pairs: { book: BookDto; series: SeriesDto }[] = [];
  for (const book of books) {
    const series = seriesById.get(book.seriesId);
    // A book whose series did not come back is dropped, so hidden content fails closed.
    if (series === undefined || isHiddenSeries(series.metadata?.genres ?? [])) continue;
    // Komga has no one-shot parameter on every book endpoint.
    if (!includeOneshots && book.oneshot) continue;
    pairs.push({ book, series });
  }
  return { visible: pairs.map((p) => p.book), seriesById, pairs };
}
