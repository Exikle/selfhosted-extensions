import { ContentRating, type TestLogger } from "@paperback/types";
import { expect } from "chai";

import { parseContentRating } from "../Komga/implementations/shared/content-rating.js";
import { chapterLabel, parseChapterTitle } from "../Komga/implementations/shared/titles.js";
import {
  decodeTagId,
  encodeTagId,
  normaliseBaseUrl,
} from "../Komga/implementations/shared/utils.js";
import { TestSuite } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Komga tests", logger);
  // Task 11 restores registerDefaultTests once every declared capability exists.

  suite.test("normaliseBaseUrl trims and strips trailing slashes", async () => {
    expect(normaliseBaseUrl(" https://k.example/ ")).to.equal("https://k.example");
    expect(normaliseBaseUrl("https://k.example//")).to.equal("https://k.example");
  });

  suite.test("tag ids round-trip", async () => {
    for (const value of ["日本語", "Ação", "Science Fiction", "a:b"]) {
      expect(decodeTagId(encodeTagId("genre", value))).to.deep.equal({ kind: "genre", value });
    }
  });

  suite.test("decodeTagId returns undefined for a malformed id", async () => {
    expect(decodeTagId("genre:%E0%A4%A")).to.equal(undefined);
  });

  suite.test("parseContentRating reads the age rating", async () => {
    expect(parseContentRating({ ageRating: 18 })).to.equal(ContentRating.ADULT);
    expect(parseContentRating({ ageRating: 16 })).to.equal(ContentRating.MATURE);
    expect(parseContentRating({ ageRating: 0 })).to.equal(ContentRating.EVERYONE);
  });

  suite.test("parseContentRating reads the genres", async () => {
    expect(parseContentRating({ genres: ["Hentai"] })).to.equal(ContentRating.ADULT);
    expect(parseContentRating({ genres: ["Ecchi"] })).to.equal(ContentRating.MATURE);
    expect(parseContentRating({})).to.equal(ContentRating.EVERYONE);
  });

  suite.test("parseContentRating takes the higher of age rating and genres", async () => {
    expect(parseContentRating({ ageRating: 0, genres: ["hentai"] })).to.equal(ContentRating.ADULT);
    expect(parseContentRating({ ageRating: 16, genres: ["smut"] })).to.equal(ContentRating.ADULT);
  });

  const titleRows: [string, number, string | undefined, number | undefined][] = [
    ["Chapter 254", 254, undefined, undefined],
    ["Ch.245", 245, undefined, undefined],
    ["Ch.040.5", 40.5, undefined, undefined],
    ["Vol.13 Ch.074.5", 74.5, undefined, 13],
    ["Vol.TBD Ch.234", 234, undefined, undefined],
    ["Vol.02 Ch.016 - The Aria", 16, "The Aria", 2],
    ["Chapter 10 - Chapter 10", 10, undefined, undefined],
    ["Chapter 5 Part 2", 5, "Part 2", undefined],
    ["Vol.1 THE END", 1, "THE END", 1],
    ["Vol. THE Beginning", 1, "Vol. THE Beginning", undefined],
    ["VOLCANO", 1, "VOLCANO", undefined],
  ];
  for (const [raw, num, title, volume] of titleRows) {
    suite.test(`parseChapterTitle: ${raw}`, async () => {
      const parsed = parseChapterTitle(raw, num);
      expect(parsed.title).to.equal(title);
      expect(parsed.volume).to.equal(volume);
    });
  }

  suite.test("chapterLabel falls back to Chapter <n>", async () => {
    expect(chapterLabel({ title: "", chapNum: 12 })).to.equal("Chapter 12");
    expect(chapterLabel({ title: "The Aria", chapNum: 12 })).to.equal("The Aria");
  });

  await suite.run();
}
