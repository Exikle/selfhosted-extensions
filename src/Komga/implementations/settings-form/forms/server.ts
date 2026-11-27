/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { ButtonRow, Form, InputRow, Section, type FormSectionElement } from "@paperback/types";

import { checkConnection } from "../../shared/connection";
import {
  getApiKey,
  getBaseUrl,
  getCredentials,
  setApiKey,
  setBaseUrl,
  setCredentials,
} from "../../shared/state";

export class KomgaServerForm extends Form {
  override readonly requiresExplicitSubmission = true;

  private baseUrl = getBaseUrl();
  private username = getCredentials().username;
  private password = getCredentials().password;
  private apiKey = getApiKey();
  private testMessage: string | undefined;

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section(
        {
          id: "server",
          header: "Server",
          footer: "Submit checks the connection and saves only when it works.",
        },
        [
          InputRow("server_url", {
            title: "Base URL",
            value: this.baseUrl,
            onValueChange: Application.Selector(this as KomgaServerForm, "handleBaseUrl"),
          }),
          InputRow("username", {
            title: "Username",
            isDisabled: this.apiKey.trim() !== "",
            value: this.username,
            onValueChange: Application.Selector(this as KomgaServerForm, "handleUsername"),
          }),
          InputRow("password", {
            title: "Password",
            isDisabled: this.apiKey.trim() !== "",
            value: this.password,
            isSecureEntry: true,
            onValueChange: Application.Selector(this as KomgaServerForm, "handlePassword"),
          }),
        ],
      ),
      Section(
        {
          id: "api_key_section",
          footer: "API keys need Komga 1.20 or later. Create one in Komga under Account settings.",
        },
        [
          InputRow("api_key", {
            title: "API Key",
            value: this.apiKey,
            isSecureEntry: true,
            onValueChange: Application.Selector(this as KomgaServerForm, "handleApiKey"),
          }),
        ],
      ),
      Section({ id: "test", footer: this.testMessage }, [
        ButtonRow("test_connection", {
          title: "Test Connection",
          onSelect: Application.Selector(this as KomgaServerForm, "handleTestConnection"),
        }),
      ]),
    ];
  }

  async handleBaseUrl(value: string): Promise<void> {
    this.baseUrl = value;
    this.testMessage = undefined;
  }

  async handleUsername(value: string): Promise<void> {
    this.username = value;
    this.testMessage = undefined;
  }

  async handlePassword(value: string): Promise<void> {
    this.password = value;
    this.testMessage = undefined;
  }

  async handleApiKey(value: string): Promise<void> {
    // The login rows are disabled while a key is set, so the form reloads only when that flips,
    // or once to drop a showing test result.
    const flips = (this.apiKey.trim() === "") !== (value.trim() === "");
    const hadMessage = this.testMessage !== undefined;
    this.apiKey = value;
    this.testMessage = undefined;
    if (flips || hadMessage) this.reloadForm();
  }

  async handleTestConnection(): Promise<void> {
    this.testMessage = "Checking…";
    this.reloadForm();
    this.testMessage = (await this.check()).message;
    this.reloadForm();
  }

  override async formDidSubmit(): Promise<void> {
    const result = await this.check();
    if (!result.ok) throw new Error(result.message);
    setBaseUrl(this.baseUrl);
    setCredentials(this.username, this.password);
    setApiKey(this.apiKey);
    Application.invalidateDiscoverSections();
  }

  // Both are passed: the interceptor would otherwise authorise with the saved credentials.
  private check() {
    return checkConnection(
      this.baseUrl,
      { username: this.username, password: this.password },
      this.apiKey.trim(),
    );
  }
}
