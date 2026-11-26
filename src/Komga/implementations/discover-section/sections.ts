/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

export type DiscoverSectionDefinition = {
  id: string;
  title: string;
  subtitle: string;
  // Genres and Latest Chapters have one look, so it gets no style picker.
  fixedStyle?: boolean;
};

export const DISCOVER_SECTIONS: DiscoverSectionDefinition[] = [
  { id: "onDeck", title: "On Deck", subtitle: "Next books to read" },
  {
    id: "latestChapters",
    title: "Latest Chapters",
    subtitle: "Newest books on your server",
    fixedStyle: true,
  },
  { id: "keepReading", title: "Keep Reading", subtitle: "Series you have started" },
  { id: "nearlyFinished", title: "Nearly Finished", subtitle: "Fewest unread books left" },
  { id: "recentlyAdded", title: "Recently Added Series", subtitle: "New on your server" },
  { id: "recentlyUpdated", title: "Recently Updated Series", subtitle: "Newly changed series" },
  { id: "genres", title: "Genres", subtitle: "Browse by genre", fixedStyle: true },
];
