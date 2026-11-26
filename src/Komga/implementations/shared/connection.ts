/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { komgaFetch, KomgaHttpError } from "../../services/network";
import type { UserDto } from "./models";
import { getApiKey, getBaseUrl } from "./state";
import { errorMessage, normaliseBaseUrl } from "./utils";

export type ConnectionResult = { ok: boolean; message: string };

export function classifyConnection(input: {
  status?: number;
  user?: UserDto;
  reached: boolean;
  baseUrl: string;
  usedApiKey?: boolean;
}): ConnectionResult {
  const { status, user, reached, baseUrl, usedApiKey } = input;
  if (!reached) return { ok: false, message: `Could not reach ${baseUrl}` };
  if (status === 401 || status === 403) {
    return { ok: false, message: usedApiKey ? "Invalid API key" : "Invalid credentials" };
  }
  if (status === 404) return { ok: false, message: "No Komga server at that URL" };
  if (status !== undefined && status >= 400) {
    return { ok: false, message: `Server returned ${status}` };
  }
  // A 200 without an email is Komga's web app answering with index.html.
  if (!user?.email) return { ok: false, message: "That URL is not a Komga API endpoint" };
  return { ok: true, message: `Connected as ${user.email}` };
}

export async function checkConnection(
  baseUrl?: string,
  credentials?: { username: string; password: string },
  apiKey?: string,
): Promise<ConnectionResult> {
  const base = normaliseBaseUrl(baseUrl ?? getBaseUrl());
  if (!base) return { ok: false, message: "No Komga server set" };
  // With no typed values the interceptor uses the saved login, so report on the saved key.
  const usedApiKey = (apiKey ?? (credentials ? "" : getApiKey())) !== "";
  try {
    const user = await komgaFetch<UserDto>("/api/v2/users/me", {
      baseUrl: base,
      credentials,
      apiKey,
    });
    return classifyConnection({ status: 200, user, reached: true, baseUrl: base, usedApiKey });
  } catch (err) {
    if (err instanceof KomgaHttpError) {
      return classifyConnection({ status: err.status, reached: true, baseUrl: base, usedApiKey });
    }
    return { ok: false, message: errorMessage(err) };
  }
}
