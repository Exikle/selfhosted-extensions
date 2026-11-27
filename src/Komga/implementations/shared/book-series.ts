/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { komgaFetch } from "../../services/network";
import { anyOfSeriesId, isHiddenSeries } from "./filters";
import type { BookDto, Page, SeriesDto } from "./models";
import { getIncludeOneshots } from "./state";

// One lookup serves both the hidden-genre check and the content rating.
export async function resolveBookSeries(books: BookDto[]): Promise<{
  visible: BookDto[];
  seriesById: Map<string, SeriesDto>;
  pairs: { book: BookDto; series: SeriesDto }[];
}> {
  if (books.length === 0) return { visible: [], seriesById: new Map(), pairs: [] };

  const seriesIds = [...new Set(books.map((b) => b.seriesId))];
  const lookup = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
    method: "POST",
    query: { unpaged: true },
    body: {
      condition: anyOfSeriesId(seriesIds),
    },
  });
  const seriesById = new Map((lookup.content ?? []).map((s) => [s.id, s]));

  const pairs: { book: BookDto; series: SeriesDto }[] = [];
  for (const book of books) {
    const series = seriesById.get(book.seriesId);
    // A book whose series did not come back is dropped, so hidden content fails closed.
    if (series === undefined || isHiddenSeries(series.metadata?.genres ?? [])) continue;
    // Komga has no one-shot parameter on every book endpoint.
    if (!getIncludeOneshots() && book.oneshot) continue;
    pairs.push({ book, series });
  }
  return { visible: pairs.map((p) => p.book), seriesById, pairs };
}
