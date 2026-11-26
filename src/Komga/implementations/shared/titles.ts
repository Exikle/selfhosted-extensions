/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

// A placeholder needs a separator after "Vol", so "Volna" is not "Vol" plus "NA".
const VOLUME_TOKEN =
  /^vol(?:ume)?(?:\.?\s*(\d+(?:\.\d+)*)|(?:\.\s*|\s+)(?:TBD|TBA|N\/A|NA|\?{1,3}))(?![A-Za-z])\s*/i;
// Digits and letters after the number mean it is part of a word, so "Chapter 12abc" is left alone.
const CHAPTER_TOKEN = /^ch(?:apter)?\.?\s*-?\d+(?:\.\d+)*(?![A-Za-z\d]|\.\d)\s*/i;
const SEPARATOR_TOKEN = /^[-–—:|]\s*/;

export function parseChapterTitle(
  raw: string,
  number: number,
): { title?: string; volume?: number } {
  let rest = raw.trim();
  let volume: number | undefined;

  let matched = true;
  while (matched && rest.length > 0) {
    matched = false;

    const volumeMatch = VOLUME_TOKEN.exec(rest);
    if (volumeMatch) {
      const parsed = parseFloat(volumeMatch[1] ?? "");
      if (volume === undefined && !Number.isNaN(parsed)) volume = parsed;
      rest = rest.slice(volumeMatch[0].length);
      matched = true;
      continue;
    }

    const chapterMatch = CHAPTER_TOKEN.exec(rest);
    if (chapterMatch) {
      rest = rest.slice(chapterMatch[0].length);
      matched = true;
      continue;
    }

    const separatorMatch = SEPARATOR_TOKEN.exec(rest);
    if (separatorMatch) {
      rest = rest.slice(separatorMatch[0].length);
      matched = true;
    }
  }

  rest = rest.trim();
  if (/^\d+(?:\.\d+)?$/.test(rest) && parseFloat(rest) === number) rest = "";

  return { title: rest.length > 0 ? rest : undefined, volume };
}

export function chapterLabel(chapter: { title?: string; chapNum: number }): string {
  return chapter.title ? chapter.title : `Chapter ${chapter.chapNum}`;
}
