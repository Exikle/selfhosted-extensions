/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "Komga",
  description: "Extension that pulls content from a self-hosted Komga server.",
  version: "4.0.0",
  icon: "icon.png",
  language: "multi",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.PROGRESS_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
  badges: [
    {
      label: "Self hosted",
      backgroundColor: "#000000",
      textColor: "#ffffff",
    },
  ],
  developers: [
    { name: "Faizan Durrani", github: "https://github.com/FaizanDurrani" },
    { name: "Lemon", github: "https://github.com/FramboisePi" },
    { name: "Exikle", github: "https://github.com/Exikle" },
  ],
} satisfies ExtensionInfo;
