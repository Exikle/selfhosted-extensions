/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { komgaFetch } from "../../services/network";
import { anyOfSeriesId, isHiddenSeries } from "./filters";
import type { BookDto, Page, SeriesDto } from "./models";
import { getIncludeOneshots } from "./state";

// One lookup serves both the hidden-genre check and the content rating.
export async function resolveBookSeries(
  books: BookDto[],
): Promise<{ visible: BookDto[]; seriesById: Map<string, SeriesDto> }> {
  if (books.length === 0) return { visible: [], seriesById: new Map() };

  const seriesIds = [...new Set(books.map((b) => b.seriesId))];
  const lookup = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
    method: "POST",
    query: { unpaged: true },
    body: {
      condition: anyOfSeriesId(seriesIds),
    },
  });
  const seriesById = new Map((lookup.content ?? []).map((s) => [s.id, s]));

  const visible = books
    // A book whose series did not come back is dropped, so hidden content fails closed.
    .filter((b) => {
      const series = seriesById.get(b.seriesId);
      return series !== undefined && !isHiddenSeries(series.metadata?.genres ?? []);
    })
    // Komga has no one-shot parameter on every book endpoint.
    .filter((b) => getIncludeOneshots() || !b.oneshot);
  return { visible, seriesById };
}
