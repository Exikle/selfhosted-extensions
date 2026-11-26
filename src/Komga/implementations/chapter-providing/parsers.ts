/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { Chapter, SourceManga } from "@paperback/types";

import type { BookDto } from "../shared/models";
import { parseChapterTitle } from "../shared/titles";

export function toChapter(
  book: BookDto,
  seriesLanguage: string | undefined,
  sourceManga: SourceManga,
): Chapter {
  const { title, volume } = parseChapterTitle(book.metadata.title, book.number);
  return {
    chapterId: book.id,
    sourceManga,
    langCode: seriesLanguage ? seriesLanguage.toUpperCase() : "UNKNOWN",
    chapNum: Number(book.metadata.number),
    title: title ?? "",
    volume: volume ?? 0,
    publishDate: new Date(book.metadata.releaseDate ?? book.fileLastModified),
    creationDate: new Date(book.created),
    sortingIndex: book.metadata.numberSort,
  };
}

// Without a complete walk, a series we did not see may still have changed, so it keeps its default.
export function decideUpdatePriorities(
  queuedIds: string[],
  updatedIds: Set<string>,
  complete: boolean,
): Map<string, "high" | "skip"> {
  const priorities = new Map<string, "high" | "skip">();
  for (const id of queuedIds) {
    if (updatedIds.has(id)) priorities.set(id, "high");
    else if (complete) priorities.set(id, "skip");
  }
  return priorities;
}
