/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { komgaFetch } from "../../services/network";
import { cacheNow } from "./clock";
import type { CollectionDto, LibraryDto, Page } from "./models";
import { getApiKey, getBaseUrl, getCredentials } from "./state";
import { rowsOf } from "./utils";

export const LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;

type LookupTypes = {
  genres: string[];
  tags: string[];
  libraries: LibraryDto[];
  collections: CollectionDto[];
  publishers: string[];
  languages: string[];
  ageRatings: string[];
};

export type LookupKind = keyof LookupTypes;

const LOAD: Record<LookupKind, () => Promise<unknown>> = {
  genres: () => komgaFetch("/api/v1/genres"),
  tags: () => komgaFetch("/api/v1/tags/series"),
  libraries: () => komgaFetch("/api/v1/libraries"),
  // One request: the 40-per-page loop cost a round trip per page.
  collections: () => komgaFetch("/api/v1/collections", { query: { unpaged: true } }),
  publishers: () => komgaFetch("/api/v1/publishers"),
  languages: () => komgaFetch("/api/v1/languages"),
  ageRatings: () => komgaFetch("/api/v1/age-ratings"),
};

// A short hash keeps the API key itself out of the map keys.
const shortHash = (text: string): string => {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${hash.toString(16)}.${text.length}`;
};

const identity = (): string => {
  const apiKey = getApiKey();
  return apiKey ? `key:${shortHash(apiKey)}` : `user:${getCredentials().username}`;
};

const entries = new Map<string, { rows: unknown[]; at: number }>();

// Filter lists for the search form and Content Settings. Throws when the lookup fails, and a
// failure is never kept.
export async function getLookup<K extends LookupKind>(kind: K): Promise<LookupTypes[K]> {
  const key = `${getBaseUrl()}\n${identity()}\n${kind}`;
  const entry = entries.get(key);
  if (entry !== undefined && cacheNow() - entry.at < LOOKUP_CACHE_TTL_MS) {
    return entry.rows as LookupTypes[K];
  }
  const response = (await LOAD[kind]()) as Page<unknown> | unknown[] | undefined;
  const rows = rowsOf(response);
  // Not a list means the answer was not Komga's; show nothing and try again next time.
  if (!Array.isArray(response) && !Array.isArray(response?.content)) return [];
  entries.set(key, { rows, at: cacheNow() });
  return rows as LookupTypes[K];
}

export const clearLookupCache = (): void => entries.clear();
