/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { Form, LabelRow, NavigationRow, Section, type FormSectionElement } from "@paperback/types";

import { checkConnection } from "../../shared/connection";
import { getBaseUrl } from "../../shared/state";
import { KomgaContentForm } from "./content";
import { KomgaHomepageForm } from "./homepage";
import { KomgaServerForm } from "./server";

export class KomgaSettingsForm extends Form {
  private status = "Checking…";

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section("status", [LabelRow("status", { title: "Status", value: this.status })]),
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
    ];
  }

  override async formWillAppear(): Promise<void> {
    this.status = "Checking…";
    this.reloadForm();
    this.status = (await checkConnection()).message;
    this.reloadForm();
  }
}
