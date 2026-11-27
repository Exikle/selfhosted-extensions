/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

// Komga's login session, kept in memory only. A request that carries a valid session beside Basic
// skips the password check and the login bookkeeping on the server. Nothing here is saved.
const sessions = new Map<string, string>();

// A newline cannot be part of either value.
const keyOf = (base: string, username: string): string => `${base}\n${username}`;

export const getSession = (base: string, username: string): string | undefined =>
  sessions.get(keyOf(base, username));

export const storeSession = (base: string, username: string, id: string): void => {
  sessions.set(keyOf(base, username), id);
};

export const dropSession = (base: string, username: string): void => {
  sessions.delete(keyOf(base, username));
};

export const hasSessions = (): boolean => sessions.size > 0;

export const clearSessions = (): void => sessions.clear();

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SESSION_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Komga's cookie holds the session id in Base64, but its X-Auth-Token header takes the id as is.
export function sessionIdFromCookie(value: string): string {
  let bits = 0;
  let count = 0;
  let decoded = "";
  for (const char of value.replace(/=+$/, "")) {
    const index = BASE64.indexOf(char);
    if (index < 0) return value;
    bits = (bits << 6) | index;
    count += 6;
    if (count >= 8) {
      count -= 8;
      decoded += String.fromCharCode((bits >> count) & 0xff);
    }
  }
  return SESSION_ID.test(decoded) ? decoded : value;
}
