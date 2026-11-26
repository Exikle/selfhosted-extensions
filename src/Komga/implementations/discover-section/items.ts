/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { ContentRating, DiscoverSectionItem } from "@paperback/types";

import { bookThumbnail, seriesThumbnail } from "../../services/network";
import { parseContentRating } from "../shared/content-rating";
import { PAGE_SIZE, type BookDto, type SeriesDto } from "../shared/models";
import type { SectionStyle } from "../shared/state";
import { capitalise } from "../shared/utils";

// Komga cannot sort series by unread count, so the sort happens here.
export const sortNearlyFinished = (series: SeriesDto[]): SeriesDto[] =>
  series
    .filter((s) => s.booksUnreadCount > 0)
    .sort((a, b) => a.booksUnreadCount - b.booksUnreadCount)
    .slice(0, PAGE_SIZE);

export function seriesItem(s: SeriesDto, style: SectionStyle): DiscoverSectionItem {
  const base = {
    mangaId: s.id,
    imageUrl: seriesThumbnail(s.id),
    title: s.metadata?.title ?? s.name,
    contentRating: parseContentRating(s.metadata ?? {}),
  };
  if (style === "hero") {
    const status = s.metadata?.status ? capitalise(s.metadata.status.toLowerCase()) : "";
    return {
      type: "featuredCarouselItem",
      ...base,
      supertitle: [status, s.metadata?.publisher].filter(Boolean).join(" · ") || undefined,
      summary: s.metadata?.summary || undefined,
      infoItems: [
        {
          symbol: "books.vertical",
          text: `${s.booksCount} ${s.booksCount === 1 ? "book" : "books"}`,
        },
        { symbol: "checkmark.circle", text: `${s.booksReadCount} read` },
      ],
    };
  }
  return style === "large"
    ? {
        type: "prominentCarouselItem",
        ...base,
        subtitle: `${s.booksReadCount} of ${s.booksCount} read`,
      }
    : { type: "simpleCarouselItem", ...base };
}

// A tap opens the series; the tile shows the book so you see what is next.
export function onDeckItem(
  b: BookDto,
  style: SectionStyle,
  contentRating?: ContentRating,
): DiscoverSectionItem {
  const base = {
    mangaId: b.seriesId,
    imageUrl: bookThumbnail(b.id),
    title: b.metadata?.title || b.name,
    contentRating,
  };
  if (style === "hero") {
    return {
      type: "featuredCarouselItem",
      ...base,
      supertitle: b.seriesTitle,
      infoItems: [{ symbol: "book", text: `${b.media?.pagesCount ?? 0} pages` }],
    };
  }
  return style === "large"
    ? { type: "prominentCarouselItem", ...base, subtitle: b.seriesTitle }
    : { type: "simpleCarouselItem", ...base, subtitle: b.seriesTitle };
}
