import { ContentRating, type TestLogger } from "@paperback/types";
import { expect } from "chai";

import { checkConnection, classifyConnection } from "../Komga/implementations/shared/connection.js";
import { parseContentRating } from "../Komga/implementations/shared/content-rating.js";
import { chapterLabel, parseChapterTitle } from "../Komga/implementations/shared/titles.js";
import {
  base64EncodeUtf8,
  basicAuthHeader,
  decodeTagId,
  encodeTagId,
  normaliseBaseUrl,
} from "../Komga/implementations/shared/utils.js";
import { pageUrl } from "../Komga/services/network.js";
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

  const base = "https://x";
  suite.test("classifyConnection reports the connected user", async () => {
    expect(
      classifyConnection({ status: 200, user: { email: "a@b.c" }, reached: true, baseUrl: base }),
    ).to.deep.equal({ ok: true, message: "Connected as a@b.c" });
  });

  suite.test("classifyConnection rejects a 200 without a user", async () => {
    expect(classifyConnection({ status: 200, reached: true, baseUrl: base })).to.deep.equal({
      ok: false,
      message: "That URL is not a Komga API endpoint",
    });
  });

  const statusRows: [number, string][] = [
    [401, "Invalid credentials"],
    [403, "Invalid credentials"],
    [404, "No Komga server at that URL"],
    [500, "Server returned 500"],
  ];
  for (const [status, message] of statusRows) {
    suite.test(`classifyConnection: ${status}`, async () => {
      expect(classifyConnection({ status, reached: true, baseUrl: base })).to.deep.equal({
        ok: false,
        message,
      });
    });
  }

  suite.test("classifyConnection reports an unreachable host", async () => {
    expect(classifyConnection({ reached: false, baseUrl: base })).to.deep.equal({
      ok: false,
      message: "Could not reach https://x",
    });
  });

  suite.test("checkConnection reports an empty base URL without a request", async () => {
    expect(await checkConnection("")).to.deep.equal({ ok: false, message: "No Komga server set" });
  });

  suite.test("pageUrl converts formats the app cannot draw", async () => {
    expect(pageUrl("b", 3, "image/avif")).to.match(/\/api\/v1\/books\/b\/pages\/3\?convert=png$/);
    expect(pageUrl("b", 3, "image/webp")).to.match(/\/api\/v1\/books\/b\/pages\/3$/);
  });

  suite.test("base64EncodeUtf8 encodes bytes, not code units", async () => {
    expect(base64EncodeUtf8("user:pass")).to.equal("dXNlcjpwYXNz");
    expect(base64EncodeUtf8("a")).to.equal("YQ==");
    expect(base64EncodeUtf8("ab")).to.equal("YWI=");
    expect(base64EncodeUtf8("é日%")).to.equal("w6nml6Ul");
    expect(basicAuthHeader("u", "p")).to.equal("Basic dTpw");
  });

  await suite.run();
}
