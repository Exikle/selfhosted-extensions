/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type {
  AdvancedSearchForm,
  PagedResults,
  SearchQuery,
  SearchResultItem,
  SortingOption,
  TagSection,
} from "@paperback/types";

import { komgaFetch, seriesThumbnail } from "../../services/network";
import { parseContentRating } from "../shared/content-rating";
import { hiddenGenreConditions, scopeConditions } from "../shared/filters";
import type { CollectionDto, LibraryDto, Page, SeriesDto } from "../shared/models";
import { decodeTagId, encodeTagId } from "../shared/utils";
import { KomgaSearchForm, type KomgaSearchMetadata } from "./forms";

const PAGE_SIZE = 40;
const MAX_COLLECTION_PAGES = 50;

// Each pairing was checked on a live server, asc and desc.
export const SORT_OPTIONS = [
  { id: "titleAsc", label: "Title (A–Z)", sort: "metadata.titleSort,asc" },
  { id: "titleDesc", label: "Title (Z–A)", sort: "metadata.titleSort,desc" },
  { id: "recentlyAdded", label: "Recently Added", sort: "created,desc" },
  { id: "recentlyUpdated", label: "Recently Updated", sort: "lastModified,desc" },
  { id: "recentlyRead", label: "Recently Read", sort: "readDate,desc" },
  { id: "mostChapters", label: "Most Chapters", sort: "booksCount,desc" },
];

// The form's group id decides which Komga condition field the value goes to.
const CONDITION_FIELDS: Record<string, string> = {
  genres: "genre",
  tags: "tag",
  libraries: "libraryId",
  collections: "collectionId",
};

export function buildSearchBody(
  title: string | undefined,
  filters: KomgaSearchMetadata["filters"],
  base: object[],
): object {
  const conditions: object[] = [...base];
  for (const [group, states] of Object.entries(filters ?? {})) {
    const field = CONDITION_FIELDS[group];
    if (!field) continue;
    for (const [id, state] of Object.entries(states ?? {})) {
      const decoded = decodeTagId(id);
      if (!decoded) continue;
      conditions.push({
        [field]: { operator: state === "excluded" ? "isNot" : "is", value: decoded.value },
      });
    }
  }
  return {
    fullTextSearch: title ?? "",
    ...(conditions.length > 0 ? { condition: { allOf: conditions } } : {}),
  };
}

export async function getSearchResults(
  query: SearchQuery<KomgaSearchMetadata>,
  metadata: { page?: number } | undefined,
  sort: SortingOption | undefined,
): Promise<PagedResults<SearchResultItem>> {
  try {
    const page = typeof metadata?.page === "number" ? metadata.page : 0;
    const komgaSort = (SORT_OPTIONS.find((o) => o.id === sort?.id) ?? SORT_OPTIONS[0]!).sort;
    const raw = query.metadata;
    const filters = raw && !Array.isArray(raw) ? raw.filters : undefined;
    const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
      method: "POST",
      query: { page, size: PAGE_SIZE, sort: komgaSort },
      body: buildSearchBody(query.title, filters, [
        ...hiddenGenreConditions(),
        ...scopeConditions(),
      ]),
    });
    const items: SearchResultItem[] = (result.content ?? []).map((series) => ({
      mangaId: series.id,
      title: series.metadata?.title ?? series.name,
      imageUrl: seriesThumbnail(series.id),
      contentRating: parseContentRating(series.metadata ?? {}),
    }));
    return items.length === PAGE_SIZE ? { items, metadata: { page: page + 1 } } : { items };
  } catch (err) {
    // Paperback also calls this during global searches, so it must not throw.
    console.log(`Komga search failed: ${err instanceof Error ? err.message : String(err)}`);
    return { items: [] };
  }
}

export async function getSortingOptions(): Promise<SortingOption[]> {
  return SORT_OPTIONS.map(({ id, label }) => ({ id, label }));
}

const stringTags = (kind: "genre" | "tag", values: string[]) =>
  values.map((value) => ({ id: encodeTagId(kind, value), title: value }));

async function loadCollections(): Promise<CollectionDto[]> {
  const all: CollectionDto[] = [];
  for (let page = 0; page < MAX_COLLECTION_PAGES; page++) {
    const result = await komgaFetch<Page<CollectionDto>>("/api/v1/collections", {
      query: { page, size: PAGE_SIZE },
    });
    all.push(...(result.content ?? []));
    if (result.last || !result.content?.length) break;
  }
  return all;
}

async function lookup<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    const result: unknown = await load();
    return Array.isArray(result) ? (result as T[]) : [];
  } catch {
    return [];
  }
}

export async function getAdvancedSearchForm(
  query: SearchQuery<KomgaSearchMetadata>,
): Promise<AdvancedSearchForm> {
  const [genres, tags, libraries, collections] = await Promise.all([
    lookup(() => komgaFetch<string[]>("/api/v1/genres")),
    lookup(() => komgaFetch<string[]>("/api/v1/tags/series")),
    lookup(() => komgaFetch<LibraryDto[]>("/api/v1/libraries")),
    lookup(loadCollections),
  ]);
  const groups: TagSection[] = [
    { id: "genres", title: "Genres", tags: stringTags("genre", genres) },
    { id: "tags", title: "Tags", tags: stringTags("tag", tags) },
    {
      id: "libraries",
      title: "Libraries",
      tags: libraries.map((l) => ({ id: encodeTagId("library", l.id), title: l.name })),
    },
    {
      id: "collections",
      title: "Collections",
      tags: collections.map((c) => ({ id: encodeTagId("collection", c.id), title: c.name })),
    },
  ];
  return new KomgaSearchForm(query, groups);
}
