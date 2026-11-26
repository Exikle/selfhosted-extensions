/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

export type TagKind =
  | "genre"
  | "tag"
  | "library"
  | "collection"
  | "publisher"
  | "ageRating"
  | "readStatus"
  | "seriesStatus"
  | "language";

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

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// btoa only takes Latin-1, so a non-ASCII password would throw or be mangled. Encode the UTF-8 bytes.
export function base64EncodeUtf8(text: string): string {
  // encodeURIComponent writes every non-ASCII byte as %XX (and a literal % as %25).
  const bytes = encodeURIComponent(text)
    .split(/(%[0-9A-F]{2})/)
    .flatMap((part) =>
      part.length === 3 && part.startsWith("%")
        ? [parseInt(part.slice(1), 16)]
        : Array.from(part, (c) => c.charCodeAt(0)),
    );
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    out += BASE64_CHARS[a >> 2]!;
    out += BASE64_CHARS[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : BASE64_CHARS[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : BASE64_CHARS[c & 63]!;
  }
  return out;
}

export const authHeaders = (
  creds: { username: string; password: string },
  apiKey: string,
): Record<string, string> =>
  apiKey
    ? { "X-API-Key": apiKey }
    : { Authorization: basicAuthHeader(creds.username, creds.password) };

export const basicAuthHeader = (username: string, password: string): string =>
  `Basic ${base64EncodeUtf8(`${username}:${password}`)}`;
