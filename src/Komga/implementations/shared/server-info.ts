/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { komgaFetch } from "../../services/network";
import type { ApiDocsDto } from "./models";

export const MIN_SERVER_VERSION = "1.19.0";
export const API_KEY_SERVER_VERSION = "1.20.0";

const numericParts = (version: string): number[] =>
  (/^\d+(?:\.\d+)*/.exec(version.trim())?.[0] ?? "0").split(".").map(Number);

// Compares the dotted numbers and ignores any suffix, so 1.30.2-beta equals 1.30.2.
export function compareVersions(a: string, b: string): number {
  const left = numericParts(a);
  const right = numericParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

// Komga only lets an admin read /actuator/info, but every running server serves its
// OpenAPI document without a login, and that carries the server version. Never throws.
export async function getServerVersion(): Promise<string | undefined> {
  try {
    const docs = await komgaFetch<ApiDocsDto>("/v3/api-docs");
    const version = docs?.info?.version;
    return typeof version === "string" && /^\d/.test(version.trim()) ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}
