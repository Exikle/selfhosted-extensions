/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { ADULT_GENRES, MATURE_GENRES } from "./content-rating";
import { normaliseBaseUrl } from "./utils";

export type SectionStyle = "hidden" | "simple" | "large" | "hero";

const SECTION_STYLES: readonly string[] = ["hidden", "simple", "large", "hero"];

const getKey = <T>(key: string, fallback: T): T => {
  const value = Application.getState(key);
  return typeof value === typeof fallback ? (value as T) : fallback;
};

const setKey = (key: string, value: unknown): void => Application.setState(value, key);

// Return copies so callers cannot mutate persisted state.
const getStringArray = (key: string, fallback: string[]): string[] => {
  const value = Application.getState(key);
  return Array.isArray(value) && value.every((v) => typeof v === "string")
    ? (value as string[]).slice()
    : fallback.slice();
};

const getSecureString = (key: string, fallback: string): string => {
  const value = Application.getSecureState(key);
  return typeof value === "string" ? value : fallback;
};

export const getBaseUrl = (): string =>
  normaliseBaseUrl(getKey("serverURL", "https://demo.komga.org"));
export const setBaseUrl = (url: string): void => setKey("serverURL", normaliseBaseUrl(url));

export const getCredentials = (): { username: string; password: string } => ({
  username: getSecureString("serverUsername", "demo@komga.org"),
  password: getSecureString("serverPassword", "komga-demo"),
});
export const setCredentials = (username: string, password: string): void => {
  Application.setSecureState(username, "serverUsername");
  Application.setSecureState(password, "serverPassword");
};

export const getHideAdultContent = (): boolean => getKey("hideAdultContent", false);
export const setHideAdultContent = (v: boolean): void => setKey("hideAdultContent", v);

export const getAdultGenres = (): string[] =>
  getStringArray("adultGenres", [...ADULT_GENRES, ...MATURE_GENRES]).map((g) => g.toLowerCase());
export const setAdultGenres = (v: string[]): void => setKey("adultGenres", v);

export const getSectionStyle = (id: string): SectionStyle => {
  const value = getKey<string>(`sectionStyle.${id}`, "simple");
  return SECTION_STYLES.includes(value) ? (value as SectionStyle) : "simple";
};
export const setSectionStyle = (id: string, style: SectionStyle): void =>
  setKey(`sectionStyle.${id}`, style);

export const getSelectedLibraries = (): string[] => getStringArray("selectedLibraries", []);
export const setSelectedLibraries = (v: string[]): void => setKey("selectedLibraries", v);

export const getIncludeOneshots = (): boolean => getKey("includeOneshots", true);
export const setIncludeOneshots = (v: boolean): void => setKey("includeOneshots", v);
