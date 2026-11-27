/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";

import {
  dropSession,
  getSession,
  sessionIdFromCookie,
  storeSession,
} from "../implementations/shared/session";
import { getApiKey, getBaseUrl, getCredentials } from "../implementations/shared/state";
import { authHeaders, basicAuthHeader } from "../implementations/shared/utils";

// The trailing slash stops https://k.example matching https://k.example.evil.test.
export const shouldAuthorise = (url: string, base: string): boolean =>
  base !== "" && (url === base || url.startsWith(`${base}/`));

const SESSION_COOKIE = "KOMGA-SESSION";
const SESSION_HEADER = "X-Auth-Token";

const headerOf = (
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined => {
  const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers?.[key];
};

// Komga sends the id in the X-Auth-Token header when the request used that header, and in the
// KOMGA-SESSION cookie otherwise (its first answer, since we send no id then). An empty header
// means Komga ended that session, so "" tells the caller to forget it.
const sessionIdOf = (response: Response): string | undefined => {
  const header = headerOf(response.headers, SESSION_HEADER);
  if (header !== undefined) return header;
  const cookie = response.cookies?.find((c) => c.name === SESSION_COOKIE)?.value;
  if (cookie) return sessionIdFromCookie(cookie);
  const raw = headerOf(response.headers, "set-cookie")?.match(
    new RegExp(`${SESSION_COOKIE}=([^;,\\s]+)`),
  )?.[1];
  return raw ? sessionIdFromCookie(raw) : undefined;
};

export class KomgaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const base = getBaseUrl();
    const ownHost = shouldAuthorise(request.url, base);
    const headers = request.headers ?? {};
    // An existing header means the caller chose the login (Test Connection), so add nothing.
    const hasAuth = Object.keys(headers).some((k) => {
      const name = k.toLowerCase();
      return name === "authorization" || name === "x-api-key";
    });
    if (!ownHost || hasAuth) return request;

    // Images load through the app, not komgaFetch, so this covers thumbnails and pages too.
    const credentials = getCredentials();
    const apiKey = getApiKey();
    const auth = authHeaders(credentials, apiKey);
    // A key makes no session, and a session sent beside a key breaks Komga 1.23.5. With Basic, a
    // stale id only means Komga logs in again.
    const session = apiKey ? undefined : getSession(base, credentials.username);
    return {
      ...request,
      headers: { ...headers, ...auth, ...(session ? { [SESSION_HEADER]: session } : {}) },
    };
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const id = sessionIdOf(response);
    // Most responses carry no id, so they cost no state read.
    if (id === undefined && response.status !== 401) return data;

    const base = getBaseUrl();
    if (!shouldAuthorise(request.url, base) || getApiKey() !== "") return data;
    const credentials = getCredentials();
    // A request that carried other logins (Test Connection) says nothing about the saved one.
    const sent = headerOf(request.headers, "authorization");
    const usedOther =
      headerOf(request.headers, "x-api-key") !== undefined ||
      (sent !== undefined && sent !== basicAuthHeader(credentials.username, credentials.password));
    if (usedOther) return data;

    if (response.status === 401) dropSession(base, credentials.username);
    else if (id === "") dropSession(base, credentials.username);
    else if (id) storeSession(base, credentials.username, id);
    return data;
  }
}
