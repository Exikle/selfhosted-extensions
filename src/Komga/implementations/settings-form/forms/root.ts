/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { Form, LabelRow, NavigationRow, Section, type FormSectionElement } from "@paperback/types";

import sourceInfo from "../../../pbconfig";
import { cacheNow } from "../../shared/clock";
import { checkConnection } from "../../shared/connection";
import {
  API_KEY_SERVER_VERSION,
  MIN_SERVER_VERSION,
  compareVersions,
  getServerVersion,
} from "../../shared/server-info";
import {
  clearStoredServerVersions,
  getApiKey,
  getBaseUrl,
  getStoredServerVersion,
  setStoredServerVersion,
} from "../../shared/state";
import { KomgaContentForm } from "./content";
import { KomgaHomepageForm } from "./homepage";
import { KomgaServerForm } from "./server";

// Found versions, per base URL, for the session; a failed lookup is not kept. Behind it sits the
// stored copy, which is trusted for a day.
const versionCache = new Map<string, string>();
const STORED_VERSION_TTL_MS = 24 * 60 * 60 * 1000;

export const clearServerVersionCache = (options: { keepStored?: boolean } = {}): void => {
  versionCache.clear();
  if (!options.keepStored) clearStoredServerVersions();
};

const knownVersion = (baseUrl: string): string | undefined => {
  const cached = versionCache.get(baseUrl);
  if (cached !== undefined) return cached;
  const stored = getStoredServerVersion(baseUrl);
  if (stored === undefined || cacheNow() - stored.at >= STORED_VERSION_TTL_MS) return undefined;
  versionCache.set(baseUrl, stored.version);
  return stored.version;
};

export class KomgaSettingsForm extends Form {
  private status = "Checking…";
  // undefined while the lookup runs; "" once it failed.
  private serverVersion: string | undefined;

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section("status_section", [LabelRow("status", { title: "Status", value: this.status })]),
      Section("settings", [
        NavigationRow("server_settings", {
          title: "Server Settings",
          value: getBaseUrl(),
          form: new KomgaServerForm(),
        }),
        NavigationRow("homepage_settings", {
          title: "Homepage Settings",
          form: new KomgaHomepageForm(),
        }),
        NavigationRow("content_settings", {
          title: "Content Settings",
          form: new KomgaContentForm(),
        }),
      ]),
      Section({ id: "about", header: "About" }, [
        LabelRow("extension_version", { title: "Extension Version", value: sourceInfo.version }),
        LabelRow("komga_version", {
          title: "Komga Version",
          value: this.serverVersion === undefined ? "Checking…" : this.serverVersion || "Unknown",
        }),
        ...this.versionWarnings(),
      ]),
    ];
  }

  private versionWarnings(): FormSectionElement<unknown>["items"] {
    const version = this.serverVersion;
    if (!version) return [];
    const warn = (id: string, title: string) =>
      LabelRow(id, { title, value: { symbol: "exclamationmark.triangle", style: "warning" } });
    return [
      ...(getApiKey() !== "" && compareVersions(version, API_KEY_SERVER_VERSION) < 0
        ? [warn("api_key_warning", "API keys need Komga 1.20 or later")]
        : []),
      ...(compareVersions(version, MIN_SERVER_VERSION) < 0
        ? [warn("version_warning", "This extension needs Komga 1.19 or later")]
        : []),
    ];
  }

  override async formWillAppear(): Promise<void> {
    const baseUrl = getBaseUrl();
    const cached = knownVersion(baseUrl);
    this.status = "Checking…";
    this.serverVersion = cached;
    this.reloadForm();
    // Run side by side so a slow version lookup never holds back the status row.
    await Promise.all([
      checkConnection().then(({ message }) => {
        this.status = message;
        this.reloadForm();
      }),
      cached !== undefined
        ? Promise.resolve()
        : getServerVersion().then((version) => {
            if (version) {
              versionCache.set(baseUrl, version);
              setStoredServerVersion(baseUrl, version, cacheNow());
            }
            this.serverVersion = version ?? "";
            this.reloadForm();
          }),
    ]);
  }
}
