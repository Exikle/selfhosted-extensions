/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

// Only the fields the extension reads. Names come from Komga's API.

export const PAGE_SIZE = 40;

export type AuthorDto = { name: string; role: string };
export type AlternateTitleDto = { label: string; title: string };
export type WebLinkDto = { label: string; url: string };

export type SeriesMetadata = {
  title: string;
  summary: string;
  status: string;
  genres: string[];
  tags: string[];
  language: string;
  readingDirection: string;
  publisher: string;
  ageRating?: number;
  totalBookCount?: number;
  alternateTitles: AlternateTitleDto[];
  links: WebLinkDto[];
};

export type SeriesDto = {
  id: string;
  libraryId: string;
  name: string;
  oneshot: boolean;
  lastModified: string;
  booksCount: number;
  booksReadCount: number;
  booksUnreadCount: number;
  booksInProgressCount: number;
  metadata: SeriesMetadata;
  booksMetadata: { authors: AuthorDto[]; summary: string };
};

export type BookDto = {
  id: string;
  seriesId: string;
  seriesTitle: string;
  name: string;
  number: number;
  oneshot: boolean;
  created: string;
  fileLastModified: string;
  media: { mediaType: string; pagesCount: number; status: string };
  metadata: { title: string; number: string; numberSort: number; releaseDate?: string };
  readProgress?: { completed: boolean; page: number };
};

export type PageDto = { number: number; mediaType: string };

export type LibraryDto = { id: string; name: string };

export type CollectionDto = {
  id: string;
  name: string;
  seriesIds: string[];
  filtered: boolean;
};

export type ReadListDto = { id: string; name: string };

export type Page<T> = { content: T[]; last: boolean; number: number };

export type TachiyomiProgressV2 = { lastReadContinuousNumberSort: number };

export type UserDto = { email?: string; roles?: string[] };
