/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { ExtensionImpl } from "@paperback/types";

import type KomgaConfig from "./pbconfig";
import { KomgaInterceptor } from "./services/interceptor";

// Partial until the capability methods land; the last task drops it so tsc checks every one.
export class KomgaExtension implements Partial<ExtensionImpl<typeof KomgaConfig>> {
  mainRequestInterceptor = new KomgaInterceptor("main");

  async initialise(): Promise<void> {
    this.mainRequestInterceptor.registerInterceptor();
  }
}

export const Komga = new KomgaExtension();
