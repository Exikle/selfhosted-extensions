/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { Chapter, ChapterDetails, SourceManga, UpdateManager } from "@paperback/types";

import { komgaFetch, pageUrl } from "../../services/network";
import { PAGE_SIZE, type BookDto, type Page, type PageDto, type SeriesDto } from "../shared/models";
import { decideUpdatePriorities, toChapter } from "./parsers";

const MAX_UPDATE_PAGES = 50;
const UPDATE_CUTOFF_MARGIN_MS = 60 * 60 * 1000;

export async function getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
  const books = await komgaFetch<Page<BookDto>>("/api/v1/books/list", {
    method: "POST",
    query: { unpaged: true },
    body: {
      condition: {
        allOf: [
          { seriesId: { operator: "is", value: sourceManga.mangaId } },
          { deleted: { operator: "isFalse" } },
          { mediaStatus: { operator: "is", value: "READY" } },
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
    const queued = updateManager.getQueuedItems().map((manga) => manga.mangaId);
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

    for (const [id, priority] of decideUpdatePriorities(queued, updated, complete)) {
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
