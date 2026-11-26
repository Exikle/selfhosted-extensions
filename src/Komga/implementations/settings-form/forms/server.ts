/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { ButtonRow, Form, InputRow, Section, type FormSectionElement } from "@paperback/types";

import { checkConnection } from "../../shared/connection";
import { getBaseUrl, getCredentials, setBaseUrl, setCredentials } from "../../shared/state";
import { normaliseBaseUrl } from "../../shared/utils";

export class KomgaServerForm extends Form {
  override readonly requiresExplicitSubmission = true;

  private baseUrl = getBaseUrl();
  private username = getCredentials().username;
  private password = getCredentials().password;
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
            value: this.username,
            onValueChange: Application.Selector(this as KomgaServerForm, "handleUsername"),
          }),
          InputRow("password", {
            title: "Password",
            value: this.password,
            isSecureEntry: true,
            onValueChange: Application.Selector(this as KomgaServerForm, "handlePassword"),
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
  }

  async handleUsername(value: string): Promise<void> {
    this.username = value;
  }

  async handlePassword(value: string): Promise<void> {
    this.password = value;
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
  }

  // Both are passed: the interceptor would otherwise authorise with the saved credentials.
  private check() {
    return checkConnection(normaliseBaseUrl(this.baseUrl), {
      username: this.username,
      password: this.password,
    });
  }
}
