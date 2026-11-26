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
import type { TachiyomiProgressV2 } from "../shared/models";
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

export async function getMangaProgress(
  sourceManga: SourceManga,
): Promise<MangaProgress | undefined> {
  try {
    const value = await readProgress(sourceManga);
    if (value <= 0) return undefined;
    const lastReadChapter = chapterForProgress(await getChapters(sourceManga), value);
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
  const successfulItems: string[] = [];
  const failedItems: string[] = [];
  for (const action of actions) {
    try {
      await komgaFetch(`/api/v1/books/${action.chapterId}/read-progress`, {
        method: "PATCH",
        body: { completed: true },
      });
      successfulItems.push(action.id);
    } catch {
      // Paperback retries failed items, so a miss here is recorded rather than thrown.
      failedItems.push(action.id);
    }
  }
  return { successfulItems, failedItems };
}
