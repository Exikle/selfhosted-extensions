/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { Chapter, ChapterDetails, SourceManga, UpdateManager } from "@paperback/types";

import { komgaFetch, pageUrl } from "../../services/network";
import { anyOfSeriesId, liveBookConditions } from "../shared/filters";
import { PAGE_SIZE, type BookDto, type Page, type PageDto, type SeriesDto } from "../shared/models";
import { decideUpdatePriorities, groupNewBooks, toChapter } from "./parsers";

const MAX_UPDATE_PAGES = 50;
const MAX_BOOK_PAGES = 10;
const UPDATE_CUTOFF_MARGIN_MS = 60 * 60 * 1000;

export async function getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
  const books = await komgaFetch<Page<BookDto>>("/api/v1/books/list", {
    method: "POST",
    query: { unpaged: true },
    body: {
      condition: {
        allOf: [
          { seriesId: { operator: "is", value: sourceManga.mangaId } },
          ...liveBookConditions(),
        ],
      },
    },
  });
  const language = sourceManga.mangaInfo.additionalInfo?.["language"];
  return books.content.map((book) => toChapter(book, language, sourceManga));
}

export async function getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
  const pages = await komgaFetch<PageDto[]>(`/api/v1/books/${chapter.chapterId}/pages`);
  return {
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    pages: pages.map((page) => pageUrl(chapter.chapterId, page.number, page.mediaType)),
  };
}

export async function processTitlesForUpdates(
  updateManager: UpdateManager,
  lastUpdateDate?: Date,
): Promise<void> {
  try {
    const queuedItems = updateManager.getQueuedItems();
    const queued = queuedItems.map((manga) => manga.mangaId);
    if (queued.length === 0 || !lastUpdateDate) return;

    const cutoff = lastUpdateDate.getTime() - UPDATE_CUTOFF_MARGIN_MS;
    const updated = new Set<string>();
    let complete = false;

    for (let page = 0; page < MAX_UPDATE_PAGES && !complete; page++) {
      const result = await komgaFetch<Page<SeriesDto>>("/api/v1/series/updated", {
        query: { page, size: PAGE_SIZE, deleted: false },
      });
      for (const series of result.content) {
        const modified = new Date(series.lastModified).getTime();
        // A row without a usable date says nothing about the cutoff.
        if (Number.isNaN(modified)) continue;
        if (modified > cutoff) updated.add(series.id);
        else complete = true;
      }
      if (result.last) complete = true;
    }

    const priorities = decideUpdatePriorities(queued, updated, complete);
    // Only the queued titles need their books; the server may have updated many more.
    const newBooks = await fetchNewBooks(
      queued.filter((id) => updated.has(id)),
      cutoff,
    );

    for (const manga of queuedItems) {
      const id = manga.mangaId;
      if (!updated.has(id)) continue;
      const books = newBooks?.bySeries.get(id) ?? [];
      if (books.length > 0) {
        const language = manga.mangaInfo?.additionalInfo?.["language"];
        try {
          await updateManager.setNewChapters(
            id,
            books.map((book) => toChapter(book, language, manga)),
          );
        } catch {
          // One title failing must not stop the rest.
        }
        priorities.set(id, "high");
      } else if (newBooks?.complete) {
        // A metadata-only edit: nothing new for the app to fetch.
        priorities.set(id, "skip");
      } else {
        priorities.set(id, "high");
      }
    }

    for (const [id, priority] of priorities) {
      try {
        await updateManager.setUpdatePriority(id, priority);
      } catch {
        // One title failing must not stop the rest.
      }
    }
  } catch {
    // A failed check tells us nothing about what changed; every title keeps its default priority.
  }
}

// Undefined when the books request failed.
async function fetchNewBooks(
  seriesIds: string[],
  cutoff: number,
): Promise<{ bySeries: Map<string, BookDto[]>; complete: boolean } | undefined> {
  if (seriesIds.length === 0) return { bySeries: new Map(), complete: true };
  const bySeries = new Map<string, BookDto[]>();
  try {
    for (let page = 0; page < MAX_BOOK_PAGES; page++) {
      const result = await komgaFetch<Page<BookDto>>("/api/v1/books/list", {
        method: "POST",
        query: { sort: "created,desc", size: PAGE_SIZE, page },
        body: {
          condition: {
            allOf: [anyOfSeriesId(seriesIds), ...liveBookConditions()],
          },
        },
      });
      const grouped = groupNewBooks(result.content, new Date(cutoff));
      for (const [id, books] of grouped.bySeries) {
        bySeries.set(id, [...(bySeries.get(id) ?? []), ...books]);
      }
      if (grouped.reachedCutoff || result.last) return { bySeries, complete: true };
    }
    return { bySeries, complete: false };
  } catch {
    return undefined;
  }
}
