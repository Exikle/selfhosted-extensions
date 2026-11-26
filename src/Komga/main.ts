/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type { ExtensionImpl } from "@paperback/types";

import {
  getChapterDetails,
  getChapters,
  processTitlesForUpdates,
} from "./implementations/chapter-providing/main";
import {
  getDiscoverSectionItems,
  getDiscoverSections,
} from "./implementations/discover-section/main";
import { getMangaDetails } from "./implementations/manga/main";
import {
  getMangaProgress,
  getMangaProgressManagementForm,
  processChapterReadActionQueue,
} from "./implementations/progress/main";
import {
  getAdvancedSearchForm,
  getSearchResults,
  getSortingOptions,
} from "./implementations/search-results/main";
import { getSettingsForm } from "./implementations/settings-form/main";
import type KomgaConfig from "./pbconfig";
import { KomgaInterceptor } from "./services/interceptor";

export class KomgaExtension implements ExtensionImpl<typeof KomgaConfig> {
  mainRequestInterceptor = new KomgaInterceptor("main");

  getMangaDetails = getMangaDetails;
  getChapters = getChapters;
  getChapterDetails = getChapterDetails;
  processTitlesForUpdates = processTitlesForUpdates;
  getDiscoverSections = getDiscoverSections;
  getDiscoverSectionItems = getDiscoverSectionItems;
  getSearchResults = getSearchResults;
  getSortingOptions = getSortingOptions;
  getAdvancedSearchForm = getAdvancedSearchForm;
  getSettingsForm = getSettingsForm;
  getMangaProgress = getMangaProgress;
  getMangaProgressManagementForm = getMangaProgressManagementForm;
  processChapterReadActionQueue = processChapterReadActionQueue;

  async initialise(): Promise<void> {
    this.mainRequestInterceptor.registerInterceptor();
  }
}

export const Komga = new KomgaExtension();
