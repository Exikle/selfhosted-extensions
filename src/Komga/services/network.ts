/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { URL } from "@paperback/types";

import { getBaseUrl } from "../implementations/shared/state";
import { basicAuthHeader } from "../implementations/shared/utils";

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

export async function komgaFetch<T>(path: string, opts: KomgaFetchOptions = {}): Promise<T> {
  const base = opts.baseUrl ?? getBaseUrl();
  if (!base) throw new Error("No Komga server set");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  // Typed-but-unsaved credentials (Test Connection) bypass the interceptor, which uses saved ones.
  if (opts.credentials) {
    headers["Authorization"] = basicAuthHeader(
      opts.credentials.username,
      opts.credentials.password,
    );
  }

  const request = {
    url: buildUrl(base, path, opts.query),
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  let status: number;
  let text: string;
  try {
    const [response, buffer] = await Application.scheduleRequest(request);
    status = response.status;
    text = Application.arrayBufferToUTF8String(buffer);
  } catch {
    // The native error can carry the full URL; keep the message to the host the user typed.
    throw new Error(`Could not reach ${base}`);
  }

  if (status >= 400) throw new KomgaHttpError(status, `Komga returned ${status}`);
  if (text.trim() === "") return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // A 2xx that is not JSON is Komga's web app answering for a wrong path.
    throw new KomgaHttpError(status, "Komga did not return JSON");
  }
}

export const seriesThumbnail = (id: string): string =>
  `${getBaseUrl()}/api/v1/series/${id}/thumbnail`;

export const bookThumbnail = (id: string): string => `${getBaseUrl()}/api/v1/books/${id}/thumbnail`;

const NATIVE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Komga converts formats the app cannot draw (avif, jxl, ...) when asked for png.
export const pageUrl = (bookId: string, n: number, mediaType: string): string =>
  `${getBaseUrl()}/api/v1/books/${bookId}/pages/${n}${
    NATIVE_IMAGE_TYPES.includes(mediaType) ? "" : "?convert=png"
  }`;
