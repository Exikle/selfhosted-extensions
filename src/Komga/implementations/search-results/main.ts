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
import { getLookup } from "../shared/lookups";
import { escapeLucene } from "../shared/lucene";
import { PAGE_SIZE, type Page, type SeriesDto } from "../shared/models";
import { getBaseUrl } from "../shared/state";
import { capitalise, decodeTagId, encodeTagId, errorMessage } from "../shared/utils";
import { KomgaSearchForm, type KomgaSearchMetadata } from "./forms";

// Each pairing was checked on a live server, asc and desc.
export const SORT_OPTIONS = [
  { id: "bestMatch", label: "Best Match", sort: "relevance" },
  { id: "titleAsc", label: "Title (A–Z)", sort: "metadata.titleSort,asc" },
  { id: "titleDesc", label: "Title (Z–A)", sort: "metadata.titleSort,desc" },
  { id: "recentlyAdded", label: "Recently Added", sort: "created,desc" },
  { id: "recentlyUpdated", label: "Recently Updated", sort: "lastModified,desc" },
  { id: "recentlyRead", label: "Recently Read", sort: "readDate,desc" },
  { id: "mostChapters", label: "Most Chapters", sort: "booksCount,desc" },
  { id: "releaseDate", label: "Release Date", sort: "booksMetadata.releaseDate,desc" },
  { id: "random", label: "Random", sort: "random" },
];

const TITLE_SORT = "metadata.titleSort,asc";
const COLLECTION_SORT = "collection.number,asc";

// The one place that picks the Komga sort. Komga applies relevance only when
// the request has search text, so Best Match falls back to title without it.
export function resolveSort(
  sortId: string | undefined,
  title: string,
  filters: KomgaSearchMetadata["filters"],
  collectionOrdered?: boolean,
): string {
  const picked = SORT_OPTIONS.find((o) => o.id === sortId);
  const sort = picked?.sort ?? "relevance";
  if (sort !== "relevance" || title.trim() !== "") return sort;
  // With exactly one included collection that is ordered, show its series in that order.
  const included = Object.entries(filters?.collections ?? {}).filter(([, s]) => s === "included");
  return included.length === 1 && collectionOrdered === true ? COLLECTION_SORT : TITLE_SORT;
}

// The form's group id decides which Komga condition field the value goes to.
const CONDITION_FIELDS: Record<string, string> = {
  genres: "genre",
  tags: "tag",
  libraries: "libraryId",
  collections: "collectionId",
  readStatus: "readStatus",
  seriesStatus: "seriesStatus",
  publishers: "publisher",
  languages: "language",
  ageRatings: "ageRating",
};

// Included values of these groups are ORed; genres and tags stay ANDed.
const ANY_OF_GROUPS = new Set([
  "libraries",
  "collections",
  "readStatus",
  "seriesStatus",
  "publishers",
  "languages",
  "ageRatings",
]);

// "None" is the unrated bucket; other values are Int ratings. Anything else is skipped.
function ageRatingCondition(value: string, excluded: boolean): object | undefined {
  if (value === "None") return { ageRating: { operator: excluded ? "isNotNull" : "isNull" } };
  const rating = Number(value);
  if (value.trim() === "" || !Number.isInteger(rating)) return undefined;
  return { ageRating: { operator: excluded ? "isNot" : "is", value: rating } };
}

export function buildSearchBody(
  title: string | undefined,
  filters: KomgaSearchMetadata["filters"],
  base: object[],
  author?: string,
): object {
  const conditions: object[] = [...base];
  for (const [group, states] of Object.entries(filters ?? {})) {
    const field = CONDITION_FIELDS[group];
    if (!field) continue;
    // A series sits in one library and one set of collections, so included values are alternatives.
    const alternatives: object[] | undefined = ANY_OF_GROUPS.has(group) ? [] : undefined;
    for (const [id, state] of Object.entries(states ?? {})) {
      const decoded = decodeTagId(id);
      if (!decoded) continue;
      const excluded = state === "excluded";
      const condition =
        group === "ageRatings"
          ? ageRatingCondition(decoded.value, excluded)
          : { [field]: { operator: excluded ? "isNot" : "is", value: decoded.value } };
      if (!condition) continue;
      if (alternatives && !excluded) alternatives.push(condition);
      else conditions.push(condition);
    }
    if (alternatives && alternatives.length > 0) conditions.push({ anyOf: alternatives });
  }
  const name = author?.trim();
  if (name) conditions.push({ author: { operator: "is", value: { name } } });
  return {
    fullTextSearch: escapeLucene(title ?? ""),
    ...(conditions.length > 0 ? { condition: { allOf: conditions } } : {}),
  };
}

function decodeAuthor(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export async function getSearchResults(
  query: SearchQuery<KomgaSearchMetadata>,
  metadata: { page?: number } | undefined,
  sort: SortingOption | undefined,
): Promise<PagedResults<SearchResultItem>> {
  try {
    const page = typeof metadata?.page === "number" ? metadata.page : 0;
    const raw = query.metadata;
    const filters = raw && !Array.isArray(raw) ? raw.filters : undefined;
    const authorText =
      raw && !Array.isArray(raw) && typeof raw.author === "string" ? raw.author : "";
    // A staff tap fills this with an encoded id; text a user typed may not be encoded at all.
    const author = decodeAuthor(authorText);
    const ordered = raw && !Array.isArray(raw) ? raw.collectionOrdered === true : false;
    const komgaSort = resolveSort(sort?.id, query.title ?? "", filters, ordered);
    const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
      method: "POST",
      query: { page, size: PAGE_SIZE, sort: komgaSort },
      body: buildSearchBody(
        query.title,
        filters,
        [...hiddenGenreConditions(), ...scopeConditions()],
        author,
      ),
    });
    const baseUrl = getBaseUrl();
    const items: SearchResultItem[] = (result.content ?? []).map((series) => ({
      mangaId: series.id,
      title: series.metadata?.title ?? series.name,
      imageUrl: seriesThumbnail(series.id, baseUrl),
      contentRating: parseContentRating(series.metadata ?? {}),
    }));
    // Every random page reshuffles, so a next page would repeat or skip series.
    return items.length === PAGE_SIZE && komgaSort !== "random"
      ? { items, metadata: { page: page + 1 } }
      : { items };
  } catch (err) {
    // Paperback also calls this during global searches, so it must not throw.
    console.log(`[Komga] search failed: ${errorMessage(err)}`);
    return { items: [] };
  }
}

export async function getSortingOptions(): Promise<SortingOption[]> {
  return SORT_OPTIONS.map(({ id, label }) => ({ id, label }));
}

const stringTags = (kind: "genre" | "tag", values: string[]) =>
  values.map((value) => ({ id: encodeTagId(kind, value), title: capitalise(value) }));

const plainTags = (kind: "publisher" | "language" | "ageRating", values: string[]) =>
  values
    .filter((value) => value !== "")
    .map((value) => ({ id: encodeTagId(kind, value), title: value }));

const READ_STATUSES = [
  ["UNREAD", "Unread"],
  ["IN_PROGRESS", "In progress"],
  ["READ", "Read"],
] as const;

const SERIES_STATUSES = [
  ["ONGOING", "Ongoing"],
  ["ENDED", "Ended"],
  ["HIATUS", "Hiatus"],
  ["ABANDONED", "Abandoned"],
] as const;

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
  const [genres, tags, libraries, collections, publishers, languages, ageRatings] =
    await Promise.all([
      lookup(() => getLookup("genres")),
      lookup(() => getLookup("tags")),
      lookup(() => getLookup("libraries")),
      lookup(() => getLookup("collections")),
      lookup(() => getLookup("publishers")),
      lookup(() => getLookup("languages")),
      lookup(() => getLookup("ageRatings")),
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
    {
      id: "readStatus",
      title: "Read Status",
      tags: READ_STATUSES.map(([value, title]) => ({
        id: encodeTagId("readStatus", value),
        title,
      })),
    },
    {
      id: "seriesStatus",
      title: "Series Status",
      tags: SERIES_STATUSES.map(([value, title]) => ({
        id: encodeTagId("seriesStatus", value),
        title,
      })),
    },
    { id: "publishers", title: "Publishers", tags: plainTags("publisher", publishers) },
    { id: "languages", title: "Languages", tags: plainTags("language", languages) },
    { id: "ageRatings", title: "Age Ratings", tags: plainTags("ageRating", ageRatings) },
  ];
  return new KomgaSearchForm(query, groups);
}
