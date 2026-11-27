/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type {
  Chapter,
  ChapterReadActionQueueProcessingResult,
  Form,
  MangaProgress,
  SourceManga,
  TrackedMangaChapterReadAction,
} from "@paperback/types";

import { komgaFetch } from "../../services/network";
import { getChapters } from "../chapter-providing/main";
import { toChapter } from "../chapter-providing/parsers";
import { liveBookConditions } from "../shared/filters";
import type { BookDto, Page, TachiyomiProgressV2 } from "../shared/models";
import { mapPool } from "../shared/utils";
import { KomgaProgressForm } from "./forms";

// The chapter with the highest sort value at or below `value`; Komga reports progress as a sort value.
export function chapterForProgress(chapters: Chapter[], value: number): Chapter | undefined {
  if (!(value > 0)) return undefined;
  let found: Chapter | undefined;
  let foundIndex = -Infinity;
  for (const chapter of chapters) {
    const index = chapter.sortingIndex ?? chapter.chapNum;
    if (index <= value && index > foundIndex) {
      found = chapter;
      foundIndex = index;
    }
  }
  return found;
}

const readProgress = async (sourceManga: SourceManga): Promise<number> => {
  const progress = await komgaFetch<TachiyomiProgressV2 | undefined>(
    `/api/v2/series/${sourceManga.mangaId}/read-progress/tachiyomi`,
  );
  const value = progress?.lastReadContinuousNumberSort;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const PUSHES_IN_FLIGHT = 4;

// The one chapter with the highest sort value at or below `value`, so a pull never downloads the list.
async function chapterAtProgress(
  sourceManga: SourceManga,
  value: number,
): Promise<Chapter | undefined> {
  const page = await komgaFetch<Page<BookDto>>("/api/v1/books/list", {
    method: "POST",
    query: { size: 1, sort: "metadata.numberSort,desc" },
    body: {
      condition: {
        allOf: [
          { seriesId: { operator: "is", value: sourceManga.mangaId } },
          ...liveBookConditions(),
          {
            anyOf: [
              { numberSort: { operator: "is", value } },
              { numberSort: { operator: "lessThan", value } },
            ],
          },
        ],
      },
    },
  });
  const book = page.content?.[0];
  if (book === undefined) return undefined;
  const language = sourceManga.mangaInfo.additionalInfo?.["language"];
  return toChapter(book, language, sourceManga);
}

export async function getMangaProgress(
  sourceManga: SourceManga,
): Promise<MangaProgress | undefined> {
  try {
    const value = await readProgress(sourceManga);
    if (value <= 0) return undefined;
    const lastReadChapter = await chapterAtProgress(sourceManga, value);
    return lastReadChapter ? { sourceManga, lastReadChapter } : undefined;
  } catch {
    // Pull must not throw; no progress is the safe answer when Komga cannot be reached.
    return undefined;
  }
}

export async function getMangaProgressManagementForm(sourceManga: SourceManga): Promise<Form> {
  const [chapters, value] = await Promise.all([
    getChapters(sourceManga),
    readProgress(sourceManga),
  ]);
  return new KomgaProgressForm(sourceManga, chapters, chapterForProgress(chapters, value));
}

export async function processChapterReadActionQueue(
  actions: TrackedMangaChapterReadAction[],
): Promise<ChapterReadActionQueueProcessingResult> {
  const outcomes = await mapPool(actions, PUSHES_IN_FLIGHT, async (action) => {
    try {
      await komgaFetch(`/api/v1/books/${action.chapterId}/read-progress`, {
        method: "PATCH",
        body: { completed: true },
      });
      return { id: action.id, ok: true };
    } catch {
      // Paperback retries failed items, so a miss here is recorded rather than thrown.
      return { id: action.id, ok: false };
    }
  });
  return {
    successfulItems: outcomes.filter((o) => o.ok).map((o) => o.id),
    failedItems: outcomes.filter((o) => !o.ok).map((o) => o.id),
  };
}
