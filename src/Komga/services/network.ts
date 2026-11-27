/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { URL } from "@paperback/types";

import { clearSessions, hasSessions } from "../implementations/shared/session";
import { getBaseUrl } from "../implementations/shared/state";
import { authHeaders, normaliseBaseUrl } from "../implementations/shared/utils";

export class KomgaHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KomgaHttpError";
  }
}

type QueryValue = string | number | boolean | string[] | undefined;

export type KomgaFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  baseUrl?: string;
  credentials?: { username: string; password: string };
  apiKey?: string;
};

export const buildUrl = (
  base: string,
  path: string,
  query?: Record<string, QueryValue>,
): string => {
  let url: URL;
  try {
    url = new URL(base + path);
  } catch {
    // The library's own message would leak its internals; the user typed this base.
    throw new Error(`Could not reach ${base}`);
  }
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    url.setQueryItem(key, Array.isArray(value) ? value : String(value));
  }
  return url.toString();
};

const SESSION_EXPIRED = "This session has been expired";

export async function komgaFetch<T>(path: string, opts: KomgaFetchOptions = {}): Promise<T> {
  const base = normaliseBaseUrl(opts.baseUrl ?? getBaseUrl());
  if (!base) throw new Error("No Komga server set");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  // Typed-but-unsaved credentials (Test Connection) bypass the interceptor, which uses saved ones.
  // A typed key wins over typed credentials, so a request never carries both headers.
  if (opts.credentials || opts.apiKey) {
    Object.assign(
      headers,
      authHeaders(opts.credentials ?? { username: "", password: "" }, opts.apiKey ?? ""),
    );
  }

  const request = {
    url: buildUrl(base, path, opts.query),
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  // The interceptor adds a saved session only when no login was typed.
  let sentSession = !opts.credentials && !opts.apiKey && hasSessions();
  let status: number;
  let empty: boolean;
  let text: string;
  for (;;) {
    try {
      const [response, buffer] = await Application.scheduleRequest(request);
      status = response.status;
      empty = buffer.byteLength === 0;
      text = empty ? "" : Application.arrayBufferToUTF8String(buffer);
    } catch {
      // The native error can carry the full URL; keep the message to the host the user typed.
      throw new Error(`Could not reach ${base}`);
    }
    // Komga answers 200 with plain text when an admin ended the session. Retry once without it,
    // so Basic logs in fresh.
    if (sentSession && status >= 200 && status < 300 && text.startsWith(SESSION_EXPIRED)) {
      sentSession = false;
      clearSessions();
      continue;
    }
    break;
  }

  if (status >= 400) throw new KomgaHttpError(status, `Komga returned ${status}`);
  if (empty) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // A 2xx that is not JSON is Komga's web app answering for a wrong path.
    throw new KomgaHttpError(status, "Komga did not return JSON");
  }
}

// Callers that build many URLs read the base once and pass it in.
export const seriesThumbnail = (id: string, base: string = getBaseUrl()): string =>
  `${base}/api/v1/series/${id}/thumbnail`;

export const bookThumbnail = (id: string, base: string = getBaseUrl()): string =>
  `${base}/api/v1/books/${id}/thumbnail`;

const NATIVE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Komga converts formats the app cannot draw (avif, jxl, ...) when asked for jpeg. PNG would be
// several times the size.
export const pageUrl = (
  bookId: string,
  n: number,
  mediaType: string,
  base: string = getBaseUrl(),
): string =>
  `${base}/api/v1/books/${bookId}/pages/${n}${
    NATIVE_IMAGE_TYPES.includes(mediaType) ? "" : "?convert=jpeg"
  }`;
