/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import {
  DiscoverSectionType,
  type DiscoverSection,
  type DiscoverSectionItem,
  type PagedResults,
} from "@paperback/types";

import { komgaFetch } from "../../services/network";
import { resolveBookSeries } from "../shared/book-series";
import { parseContentRating } from "../shared/content-rating";
import {
  hiddenGenreConditions,
  isHiddenSeries,
  liveBookConditions,
  scopeConditions,
  scopeQuery,
} from "../shared/filters";
import {
  PAGE_SIZE,
  type BookDto,
  type CollectionDto,
  type Page,
  type ReadListDto,
  type SeriesDto,
} from "../shared/models";
import {
  getEnabledReadLists,
  getIncludeOneshots,
  getReadListEnabled,
  getSectionStyle,
  getSelectedLibraries,
  type SectionStyle,
} from "../shared/state";
import { capitalise, encodeTagId, errorMessage, rowsOf } from "../shared/utils";
import { chapterUpdateItem, onDeckItem, seriesItem, sortNearlyFinished } from "./items";
import { DISCOVER_SECTIONS } from "./sections";

const STYLE_TYPES: Record<Exclude<SectionStyle, "hidden">, DiscoverSectionType> = {
  simple: DiscoverSectionType.simpleCarousel,
  large: DiscoverSectionType.prominentCarousel,
  hero: DiscoverSectionType.featured,
};

// Sections with one look, switched on or off by a toggle.
const FIXED_TYPES: Record<string, DiscoverSectionType> = {
  genres: DiscoverSectionType.genres,
  collections: DiscoverSectionType.genres,
  latestChapters: DiscoverSectionType.chapterUpdates,
};

const READ_LIST_PREFIX = "readList:";

// Throws when the request fails, so a caller can tell "none" from "could not load".
export async function fetchReadLists(): Promise<ReadListDto[]> {
  const response = await komgaFetch<Page<ReadListDto> | ReadListDto[]>("/api/v1/readlists", {
    query: { unpaged: true },
  });
  return rowsOf(response).filter((r) => typeof r?.id === "string" && typeof r?.name === "string");
}

// A failed load is no read lists.
export async function loadReadLists(): Promise<ReadListDto[]> {
  try {
    return await fetchReadLists();
  } catch (err) {
    console.log(`[Komga] Could not load read lists: ${errorMessage(err)}`);
    return [];
  }
}

export async function getDiscoverSections(): Promise<DiscoverSection[]> {
  const sections: DiscoverSection[] = [];
  for (const { id, title, subtitle, fixedStyle } of DISCOVER_SECTIONS) {
    const style = getSectionStyle(id);
    if (style === "hidden") continue;
    sections.push({
      id,
      title,
      subtitle,
      type: fixedStyle ? (FIXED_TYPES[id] ?? DiscoverSectionType.genres) : STYLE_TYPES[style],
    });
  }
  // Nothing enabled means nothing to look up, so Home never waits on the read list request.
  if (getEnabledReadLists().length === 0) return sections;
  // A read list deleted on the server is missing here, so its section simply goes away.
  for (const { id, name } of await loadReadLists()) {
    if (!getReadListEnabled(id)) continue;
    sections.push({
      id: `${READ_LIST_PREFIX}${id}`,
      title: name,
      type: DiscoverSectionType.chapterUpdates,
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
      { deleted: { operator: "isFalse" } },
      { readStatus: { operator: "is", value: "IN_PROGRESS" } },
      ...hiddenGenreConditions(),
      ...scopeConditions(),
    ],
  },
});

async function onDeckItems(
  style: SectionStyle,
  page: number,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<BookDto>>("/api/v1/books/ondeck", {
    query: { page, size: PAGE_SIZE, ...scopeQuery() },
  });
  const books = result.content ?? [];
  if (books.length === 0) return withNext([], 0, page);

  const { visible, seriesById } = await resolveBookSeries(books);
  const items = visible.map((b) =>
    onDeckItem(b, style, parseContentRating(seriesById.get(b.seriesId)?.metadata ?? {})),
  );
  return withNext(items, books.length, page);
}

async function latestChapterItems(page: number): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<BookDto>>("/api/v1/books/list", {
    method: "POST",
    query: { page, size: PAGE_SIZE, sort: "created,desc" },
    body: {
      condition: {
        allOf: [...liveBookConditions(), ...scopeConditions()],
      },
    },
  });
  const books = result.content ?? [];
  const { visible, seriesById } = await resolveBookSeries(books);
  const items = visible.map((b) => chapterUpdateItem(b, seriesById.get(b.seriesId)!));
  return withNext(items, books.length, page);
}

async function readListItems(
  readListId: string,
  page: number,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<BookDto>>(
    `/api/v1/readlists/${encodeURIComponent(readListId)}/books`,
    {
      query: {
        page,
        size: PAGE_SIZE,
        deleted: false,
        media_status: "READY",
        ...scopeQuery(),
      },
    },
  );
  const books = result.content ?? [];
  const { visible, seriesById } = await resolveBookSeries(books);
  const items = visible.map((b) => chapterUpdateItem(b, seriesById.get(b.seriesId)!));
  // Paging follows the server's last flag, so a hidden-only page does not end the list early.
  return result.last === false && books.length > 0
    ? { items, metadata: { page: page + 1 } }
    : { items };
}

async function keepReadingItems(
  style: SectionStyle,
  page: number,
): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
    method: "POST",
    query: { page, size: PAGE_SIZE, sort: "readDate,desc" },
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

async function collectionItems(): Promise<PagedResults<DiscoverSectionItem>> {
  const result = await komgaFetch<Page<CollectionDto> | CollectionDto[]>("/api/v1/collections", {
    query: { unpaged: true, library_id: getSelectedLibraries() },
  });
  // A tap searches this collection. An ordered one is flagged so Best Match uses its own order.
  const items: DiscoverSectionItem[] = rowsOf(result).map((c) => ({
    type: "genresCarouselItem",
    name: c.name,
    searchQuery: {
      title: "",
      metadata: {
        filters: { collections: { [encodeTagId("collection", c.id)]: "included" } },
        ...(c.ordered === true ? { collectionOrdered: true } : {}),
      },
    },
  }));
  return { items };
}

export async function getDiscoverSectionItems(
  section: DiscoverSection,
  metadata?: { page?: number },
): Promise<PagedResults<DiscoverSectionItem>> {
  try {
    const page = pageOf(metadata);
    if (section.id.startsWith(READ_LIST_PREFIX)) {
      return await readListItems(section.id.slice(READ_LIST_PREFIX.length), page);
    }
    const style = getSectionStyle(section.id);
    switch (section.id) {
      case "onDeck":
        return await onDeckItems(style, page);
      case "latestChapters":
        return await latestChapterItems(page);
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
      case "collections":
        return await collectionItems();
      default:
        return { items: [] };
    }
  } catch (err) {
    // A failed load shows an empty section, not an error.
    console.log(`[Komga] section ${section.id} failed: ${errorMessage(err)}`);
    return { items: [] };
  }
}
