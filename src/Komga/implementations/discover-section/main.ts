/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import {
  DiscoverSectionType,
  type DiscoverSection,
  type DiscoverSectionItem,
  type PagedResults,
} from "@paperback/types";

import { komgaFetch } from "../../services/network";
import {
  hiddenGenreConditions,
  isHiddenSeries,
  scopeConditions,
  scopeQuery,
} from "../shared/filters";
import type { BookDto, Page, SeriesDto } from "../shared/models";
import {
  getAdultGenres,
  getHideAdultContent,
  getIncludeOneshots,
  getSectionStyle,
  getSelectedLibraries,
  type SectionStyle,
} from "../shared/state";
import { capitalise, encodeTagId } from "../shared/utils";
import { onDeckItem, seriesItem, sortNearlyFinished } from "./items";
import { DISCOVER_SECTIONS } from "./sections";

const PAGE_SIZE = 40;

const STYLE_TYPES: Record<Exclude<SectionStyle, "hidden">, DiscoverSectionType> = {
  simple: DiscoverSectionType.simpleCarousel,
  large: DiscoverSectionType.prominentCarousel,
  hero: DiscoverSectionType.featured,
};

export async function getDiscoverSections(): Promise<DiscoverSection[]> {
  const sections: DiscoverSection[] = [];
  for (const { id, title, subtitle, fixedStyle } of DISCOVER_SECTIONS) {
    const style = getSectionStyle(id);
    if (style === "hidden") continue;
    sections.push({
      id,
      title,
      subtitle,
      type: fixedStyle ? DiscoverSectionType.genres : STYLE_TYPES[style],
    });
  }
  return sections;
}

const pageOf = (metadata: { page?: number } | undefined): number =>
  typeof metadata?.page === "number" ? metadata.page : 0;

// A full page means there may be more; undefined metadata ends paging.
const withNext = (
  items: DiscoverSectionItem[],
  fetched: number,
  page: number,
): PagedResults<DiscoverSectionItem> =>
  fetched === PAGE_SIZE ? { items, metadata: { page: page + 1 } } : { items };

const inProgressBody = (): object => ({
  condition: {
    allOf: [
      { readStatus: { operator: "is", value: "IN_PROGRESS" } },
      ...hiddenGenreConditions(),
      ...scopeConditions(),
    ],
  },
});

async function hiddenSeriesIds(): Promise<Set<string>> {
  const genres = getHideAdultContent() ? getAdultGenres() : [];
  if (genres.length === 0) return new Set();
  const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
    method: "POST",
    query: { unpaged: true },
    body: {
      condition: { anyOf: genres.map((genre) => ({ genre: { operator: "is", value: genre } })) },
    },
  });
  return new Set((result.content ?? []).map((s) => s.id));
}

async function onDeckItems(
  style: SectionStyle,
  page: number,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<BookDto>>("/api/v1/books/ondeck", {
    query: { page, size: PAGE_SIZE, ...scopeQuery() },
  });
  const books = result.content ?? [];
  const hidden = await hiddenSeriesIds();
  const items = books
    .filter((b) => !hidden.has(b.seriesId))
    // Komga has no one-shot parameter on this endpoint.
    .filter((b) => getIncludeOneshots() || !b.oneshot)
    .map((b) => onDeckItem(b, style));
  return withNext(items, books.length, page);
}

async function keepReadingItems(
  style: SectionStyle,
  page: number,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
    method: "POST",
    query: { page, size: PAGE_SIZE, sort: "readProgress.readDate,desc" },
    body: inProgressBody(),
  });
  const content = result.content ?? [];
  return withNext(
    content.map((s) => seriesItem(s, style)),
    content.length,
    page,
  );
}

async function nearlyFinishedItems(
  style: SectionStyle,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
    method: "POST",
    query: { unpaged: true },
    body: inProgressBody(),
  });
  return { items: sortNearlyFinished(result.content ?? []).map((s) => seriesItem(s, style)) };
}

async function feedItems(
  path: string,
  style: SectionStyle,
  page: number,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<SeriesDto>>(path, {
    query: {
      page,
      size: PAGE_SIZE,
      ...scopeQuery(),
      // oneshot=true would return only one-shots, so leave it unset when they are included.
      oneshot: getIncludeOneshots() ? undefined : false,
    },
  });
  const content = result.content ?? [];
  const items = content
    .filter((s) => !isHiddenSeries(s.metadata?.genres ?? []))
    .map((s) => seriesItem(s, style));
  return withNext(items, content.length, page);
}

async function genreItems(): Promise<PagedResults<DiscoverSectionItem>> {
  const genres = await komgaFetch<string[]>("/api/v1/genres", {
    query: { library_id: getSelectedLibraries() },
  });
  const items: DiscoverSectionItem[] = (Array.isArray(genres) ? genres : [])
    .filter((genre) => !isHiddenSeries([genre]))
    .map((genre) => ({
      type: "genresCarouselItem",
      name: capitalise(genre),
      searchQuery: {
        title: "",
        metadata: { filters: { genres: { [encodeTagId("genre", genre)]: "included" } } },
      },
    }));
  return { items };
}

export async function getDiscoverSectionItems(
  section: DiscoverSection,
  metadata?: { page?: number },
): Promise<PagedResults<DiscoverSectionItem>> {
  try {
    const style = getSectionStyle(section.id);
    const page = pageOf(metadata);
    switch (section.id) {
      case "onDeck":
        return await onDeckItems(style, page);
      case "keepReading":
        return await keepReadingItems(style, page);
      case "nearlyFinished":
        return await nearlyFinishedItems(style);
      case "recentlyAdded":
        return await feedItems("/api/v1/series/new", style, page);
      case "recentlyUpdated":
        return await feedItems("/api/v1/series/updated", style, page);
      case "genres":
        return await genreItems();
      default:
        return { items: [] };
    }
  } catch (err) {
    // A failed load shows an empty section, not an error.
    const detail = err instanceof Error ? err.message : String(err);
    console.log(`Komga section ${section.id} failed: ${detail}`);
    return { items: [] };
  }
}
