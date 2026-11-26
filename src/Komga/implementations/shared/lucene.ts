/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

// Lucene reserved characters, as in Mihon's Komga extension. "&&" and "||" are
// escaped by escaping each character, which Lucene accepts.
const LUCENE_RESERVED = /[+\-&|!(){}[\]^"~*?:\\/]/g;

export function escapeLucene(text: string): string {
  return text.replace(LUCENE_RESERVED, "\\$&");
}
