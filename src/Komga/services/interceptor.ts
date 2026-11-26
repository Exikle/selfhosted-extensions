/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";

import { getApiKey, getBaseUrl, getCredentials } from "../implementations/shared/state";
import { authHeaders } from "../implementations/shared/utils";

// The trailing slash stops https://k.example matching https://k.example.evil.test.
export const shouldAuthorise = (url: string, base: string): boolean =>
  base !== "" && (url === base || url.startsWith(`${base}/`));

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
    return {
      ...request,
      headers: { ...headers, ...authHeaders(getCredentials(), getApiKey()) },
    };
  }

  override async interceptResponse(
    _request: Request,
    _response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return data;
  }
}
