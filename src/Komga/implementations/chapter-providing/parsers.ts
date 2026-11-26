/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { Chapter, SourceManga } from "@paperback/types";

import type { BookDto } from "../shared/models";
import { parseChapterTitle } from "../shared/titles";

// A blank or non-numeric number would give 0 or NaN, so the sort key stands in.
export function parseChapterNumber(book: BookDto): number {
  const raw = book.metadata.number?.trim() ?? "";
  const parsed = raw === "" ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : book.metadata.numberSort;
}

export function toChapter(
  book: BookDto,
  seriesLanguage: string | undefined,
  sourceManga: SourceManga,
): Chapter {
  const chapNum = parseChapterNumber(book);
  const { title, volume } = parseChapterTitle(book.metadata.title, chapNum);
  return {
    chapterId: book.id,
    sourceManga,
    langCode: seriesLanguage ? seriesLanguage.toUpperCase() : "UNKNOWN",
    chapNum,
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

// Books arrive newest first, so the first one at or before the cutoff ends the walk.
export function groupNewBooks(
  books: BookDto[],
  cutoff: Date,
): { bySeries: Map<string, BookDto[]>; reachedCutoff: boolean } {
  const bySeries = new Map<string, BookDto[]>();
  const cutoffMs = cutoff.getTime();
  for (const book of books) {
    const created = new Date(book.created).getTime();
    // A row without a usable date says nothing about the cutoff.
    if (Number.isNaN(created)) continue;
    if (created <= cutoffMs) return { bySeries, reachedCutoff: true };
    const list = bySeries.get(book.seriesId);
    if (list) list.push(book);
    else bySeries.set(book.seriesId, [book]);
  }
  return { bySeries, reachedCutoff: false };
}
