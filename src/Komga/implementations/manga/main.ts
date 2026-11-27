/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { MangaInfoExtra, MangaInfoRelationSection, SourceManga } from "@paperback/types";

import { KomgaHttpError, komgaFetch, seriesThumbnail } from "../../services/network";
import { hiddenGenreConditions, libraryConditions } from "../shared/filters";
import type { CollectionDto, Page, SeriesDto } from "../shared/models";
import { getCachedSeries } from "../shared/series-cache";
import { getBaseUrl } from "../shared/state";
import { errorMessage } from "../shared/utils";
import { staffSection, toSourceManga } from "./parsers";

const RELATION_LIMIT = 20;

// Other series in each collection this series is in, in its order (title for unordered ones). Never throws.
export async function relationSections(seriesId: string): Promise<MangaInfoRelationSection[]> {
  const baseUrl = getBaseUrl();
  try {
    const collections = await komgaFetch<CollectionDto[]>(`/api/v1/series/${seriesId}/collections`);
    const sections = await Promise.all(
      (collections ?? []).map(async (collection): Promise<MangaInfoRelationSection | undefined> => {
        try {
          // The collectionId condition is what makes Komga honour collection.number.
          const page = await komgaFetch<Page<SeriesDto>>("/api/v1/series/list", {
            method: "POST",
            // Komga only honours collection.number for a collection that is ordered.
            query: {
              sort:
                collection.ordered === true ? "collection.number,asc" : "metadata.titleSort,asc",
              size: RELATION_LIMIT + 1,
            },
            body: {
              condition: {
                allOf: [
                  { collectionId: { operator: "is", value: collection.id } },
                  ...hiddenGenreConditions(),
                  ...libraryConditions(),
                ],
              },
            },
          });
          const items = (page.content ?? [])
            .filter((series) => series.id !== seriesId)
            .slice(0, RELATION_LIMIT)
            .map((series) => ({
              id: series.id,
              imageUrl: seriesThumbnail(series.id, baseUrl),
              title: series.metadata?.title ?? series.name,
            }));
          if (items.length === 0) return undefined;
          return {
            type: "relation",
            id: `collection:${collection.id}`,
            title: `In ${collection.name}`,
            items,
          };
        } catch (err) {
          console.log(`[Komga] collection ${collection.id} lookup failed: ${errorMessage(err)}`);
          return undefined;
        }
      }),
    );
    return sections.filter((section): section is MangaInfoRelationSection => section !== undefined);
  } catch (err) {
    console.log(`[Komga] relations lookup failed: ${errorMessage(err)}`);
    return [];
  }
}

export async function getMangaDetails(mangaId: string): Promise<SourceManga> {
  // The lookup only needs the id, so it runs alongside the series fetch. It never rejects.
  const relations = relationSections(mangaId);
  try {
    const series =
      getCachedSeries(getBaseUrl(), mangaId) ??
      (await komgaFetch<SeriesDto>(`/api/v1/series/${mangaId}`));
    const manga = toSourceManga(series);
    const staff = staffSection(series);
    const extras: MangaInfoExtra[] = [...(staff ? [staff] : []), ...(await relations)];
    if (extras.length > 0) manga.mangaInfo.extras = extras;
    return manga;
  } catch (err) {
    if (err instanceof KomgaHttpError && err.status === 404) throw new Error("Series not found");
    throw err;
  }
}
