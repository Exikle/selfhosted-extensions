/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import {
  getAdultGenres,
  getHideAdultContent,
  getIncludeOneshots,
  getSelectedLibraries,
} from "./state";

// Komga condition objects, passed straight into a series/list body.
export const hiddenGenreConditions = (): object[] =>
  getHideAdultContent()
    ? getAdultGenres().map((genre) => ({ genre: { operator: "isNot", value: genre } }))
    : [];

export const libraryConditions = (): object[] => {
  const libraries = getSelectedLibraries();
  return libraries.length > 0
    ? [{ anyOf: libraries.map((id) => ({ libraryId: { operator: "is", value: id } })) }]
    : [];
};

export const scopeConditions = (): object[] => {
  const conditions = libraryConditions();
  if (!getIncludeOneshots()) conditions.push({ oneShot: { operator: "isFalse" } });
  return conditions;
};

export const scopeQuery = (): { library_id?: string[] } => {
  const libraries = getSelectedLibraries();
  return libraries.length > 0 ? { library_id: libraries } : {};
};

export const isHiddenSeries = (genres: string[]): boolean => {
  if (!getHideAdultContent()) return false;
  const hidden = getAdultGenres();
  return genres.some((genre) => hidden.includes(genre.toLowerCase()));
};

// Books that are still on the server and readable.
export const liveBookConditions = (): object[] => [
  { deleted: { operator: "isFalse" } },
  { mediaStatus: { operator: "is", value: "READY" } },
];

export const anyOfSeriesId = (ids: string[]): object => ({
  anyOf: ids.map((id) => ({ seriesId: { operator: "is", value: id } })),
});
