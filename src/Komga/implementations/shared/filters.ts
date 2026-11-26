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

export const scopeConditions = (): object[] => {
  const conditions: object[] = [];
  const libraries = getSelectedLibraries();
  if (libraries.length > 0) {
    conditions.push({
      anyOf: libraries.map((id) => ({ libraryId: { operator: "is", value: id } })),
    });
  }
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
