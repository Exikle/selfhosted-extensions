/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { ExtensionImpl } from "@paperback/types";

import type KomgaConfig from "./pbconfig";

// Partial until the capability methods land; the last task drops it so tsc checks every one.
export class KomgaExtension implements Partial<ExtensionImpl<typeof KomgaConfig>> {
  async initialise(): Promise<void> {}
}

export const Komga = new KomgaExtension();
