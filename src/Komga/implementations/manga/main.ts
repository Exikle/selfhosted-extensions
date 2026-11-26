/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { SourceManga } from "@paperback/types";

import { KomgaHttpError, komgaFetch } from "../../services/network";
import type { SeriesDto } from "../shared/models";
import { toSourceManga } from "./parsers";

export async function getMangaDetails(mangaId: string): Promise<SourceManga> {
  try {
    const series = await komgaFetch<SeriesDto>(`/api/v1/series/${mangaId}`);
    return toSourceManga(series);
  } catch (err) {
    if (err instanceof KomgaHttpError && err.status === 404) throw new Error("Series not found");
    throw err;
  }
}
