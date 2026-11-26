/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { SourceManga, TagSection } from "@paperback/types";

import { seriesThumbnail } from "../../services/network";
import { parseContentRating } from "../shared/content-rating";
import type { AuthorDto, SeriesDto } from "../shared/models";
import { capitalise, encodeTagId } from "../shared/utils";

const SHARE_LINK_PREFERENCE = ["anilist", "mangadex", "mangaupdates", "myanimelist"];

// The first link from the preferred sites wins, in that order; any other link is the fallback.
export function pickShareUrl(
  links: { label: string; url: string }[] | undefined,
): string | undefined {
  links ??= [];
  for (const preferred of SHARE_LINK_PREFERENCE) {
    const match = links.find((link) => link.label.toLowerCase().replace(/\s+/g, "") === preferred);
    if (match) return match.url;
  }
  return links[0]?.url;
}

const namesWithRole = (authors: AuthorDto[] | undefined, role: string): string | undefined =>
  (authors ?? [])
    .filter((author) => author.role === role)
    .map((author) => author.name)
    .join(", ") || undefined;

export function toSourceManga(series: SeriesDto): SourceManga {
  const { metadata, booksMetadata } = series;

  const tagGroups: TagSection[] = [
    {
      id: "genres",
      title: "Genres",
      tags: (metadata.genres ?? []).map((genre) => ({
        id: encodeTagId("genre", genre),
        title: capitalise(genre),
      })),
    },
    {
      id: "tags",
      title: "Tags",
      tags: (metadata.tags ?? []).map((tag) => ({
        id: encodeTagId("tag", tag),
        title: capitalise(tag),
      })),
    },
  ];

  return {
    mangaId: series.id,
    mangaInfo: {
      primaryTitle: metadata.title,
      secondaryTitles: (metadata.alternateTitles ?? []).map((alt) => alt.title),
      thumbnailUrl: seriesThumbnail(series.id),
      contentRating: parseContentRating(metadata),
      status: metadata.status.toLowerCase(),
      author: namesWithRole(booksMetadata.authors, "writer"),
      artist: namesWithRole(booksMetadata.authors, "penciller"),
      synopsis: metadata.summary || booksMetadata.summary,
      tagGroups,
      shareUrl: pickShareUrl(metadata.links),
      isWebtoon: metadata.readingDirection === "WEBTOON",
      additionalInfo: {
        language: metadata.language,
        readingDirection: metadata.readingDirection,
        publisher: metadata.publisher,
        books: String(series.booksCount),
        ...(metadata.totalBookCount === undefined
          ? {}
          : { totalBooks: String(metadata.totalBookCount) }),
        booksRead: String(series.booksReadCount),
        booksUnread: String(series.booksUnreadCount),
        booksInProgress: String(series.booksInProgressCount),
      },
    },
  };
}
