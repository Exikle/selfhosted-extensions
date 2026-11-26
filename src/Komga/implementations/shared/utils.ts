/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

export type TagKind = "genre" | "tag" | "library" | "collection";

export const normaliseBaseUrl = (url: string): string => url.trim().replace(/\/+$/, "");

export const encodeTagId = (kind: TagKind, value: string): string =>
  `${kind}:${encodeURIComponent(value)}`;

export function decodeTagId(id: string): { kind: string; value: string } | undefined {
  const index = id.indexOf(":");
  if (index < 0) return undefined;
  try {
    return { kind: id.slice(0, index), value: decodeURIComponent(id.slice(index + 1)) };
  } catch {
    // A malformed percent sequence means the id did not come from encodeTagId.
    return undefined;
  }
}

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
