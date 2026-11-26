/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";

import { getBaseUrl, getCredentials } from "../implementations/shared/state";
import { basicAuthHeader } from "../implementations/shared/utils";

export class KomgaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const base = getBaseUrl();
    // The trailing slash stops https://k.example matching https://k.example.evil.test.
    const ownHost = base !== "" && (request.url === base || request.url.startsWith(`${base}/`));
    const headers = request.headers ?? {};
    const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
    if (!ownHost || hasAuth) return request;

    const { username, password } = getCredentials();
    // Images load through the app, not komgaFetch, so this covers thumbnails and pages too.
    return {
      ...request,
      headers: { ...headers, Authorization: basicAuthHeader(username, password) },
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
