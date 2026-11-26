/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { Form } from "@paperback/types";

import { KomgaSettingsForm } from "./forms/root";

export async function getSettingsForm(): Promise<Form> {
  return new KomgaSettingsForm();
}
