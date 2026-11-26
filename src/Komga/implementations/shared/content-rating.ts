/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { ContentRating } from "@paperback/types";

export const ADULT_GENRES = ["adult", "hentai", "smut", "erotica", "pornographic"];
export const MATURE_GENRES = ["mature", "ecchi"];

const ratingFromAge = (ageRating: number): ContentRating => {
  if (ageRating >= 18) return ContentRating.ADULT;
  if (ageRating >= 16) return ContentRating.MATURE;
  return ContentRating.EVERYONE;
};

const ratingFromGenres = (genres: string[]): ContentRating => {
  const lower = genres.map((g) => g.toLowerCase());
  if (ADULT_GENRES.some((g) => lower.includes(g))) return ContentRating.ADULT;
  if (MATURE_GENRES.some((g) => lower.includes(g))) return ContentRating.MATURE;
  return ContentRating.EVERYONE;
};

// The higher of the age rating and the genre rating wins.
export const parseContentRating = (meta: {
  ageRating?: number | null;
  genres?: string[];
}): ContentRating => {
  const ratings = [ratingFromAge(meta.ageRating ?? 0), ratingFromGenres(meta.genres ?? [])];
  if (ratings.includes(ContentRating.ADULT)) return ContentRating.ADULT;
  if (ratings.includes(ContentRating.MATURE)) return ContentRating.MATURE;
  return ContentRating.EVERYONE;
};
