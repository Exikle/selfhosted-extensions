import { ContentRating, type TestLogger } from "@paperback/types";
import { expect } from "chai";

import { getMangaDetails } from "../Komga/implementations/manga/main.js";
import { pickShareUrl, toSourceManga } from "../Komga/implementations/manga/parsers.js";
import { checkConnection, classifyConnection } from "../Komga/implementations/shared/connection.js";
import { parseContentRating } from "../Komga/implementations/shared/content-rating.js";
import type { SeriesDto } from "../Komga/implementations/shared/models.js";
import { chapterLabel, parseChapterTitle } from "../Komga/implementations/shared/titles.js";
import {
  base64EncodeUtf8,
  basicAuthHeader,
  decodeTagId,
  encodeTagId,
  normaliseBaseUrl,
} from "../Komga/implementations/shared/utils.js";
import { KomgaInterceptor, shouldAuthorise } from "../Komga/services/interceptor.js";
import { buildUrl, komgaFetch, pageUrl } from "../Komga/services/network.js";
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

  suite.test("shouldAuthorise only matches the own host", async () => {
    expect(shouldAuthorise("https://k.example/api/v1/x", "https://k.example")).to.equal(true);
    expect(shouldAuthorise("https://k.example", "https://k.example")).to.equal(true);
    expect(shouldAuthorise("https://k.example.evil/api", "https://k.example")).to.equal(false);
    expect(shouldAuthorise("https://other/api", "https://k.example")).to.equal(false);
    expect(shouldAuthorise("https://k.example/api", "")).to.equal(false);
  });

  const interceptor = new KomgaInterceptor("test");
  const own = "https://demo.komga.org";
  suite.test("interceptor authorises the own host, images included", async () => {
    for (const path of ["/api/v1/series/s/thumbnail", "/api/v1/books/b/pages/1"]) {
      const out = await interceptor.interceptRequest({ url: own + path, method: "GET" });
      expect(out.headers?.["Authorization"]).to.match(/^Basic /);
    }
  });

  suite.test("interceptor leaves a look-alike host alone", async () => {
    const out = await interceptor.interceptRequest({ url: `${own}.evil/api`, method: "GET" });
    expect(out.headers?.["Authorization"]).to.equal(undefined);
  });

  suite.test("interceptor keeps an existing Authorization header", async () => {
    const out = await interceptor.interceptRequest({
      url: `${own}/api`,
      method: "GET",
      headers: { authorization: "Bearer x" },
    });
    expect(out.headers).to.deep.equal({ authorization: "Bearer x" });
  });

  suite.test("buildUrl repeats array keys, skips undefined and empty, and encodes", async () => {
    const url = buildUrl("https://k", "/api/v1/x", {
      a: ["1", "2"],
      b: undefined,
      c: [],
      d: "a b&c",
      e: 3,
      f: false,
    });
    expect(url).to.equal("https://k/api/v1/x?a=1&a=2&d=a%20b%26c&e=3&f=false");
    expect(buildUrl("https://k", "/p", { c: [], b: undefined })).to.equal("https://k/p");
  });

  suite.test("buildUrl maps a malformed base to Could not reach", async () => {
    expect(() => buildUrl("http://[::1", "/p")).to.throw("Could not reach http://[::1");
  });

  const withResponse = async <T>(
    status: number,
    body: string | Error,
    run: () => Promise<T>,
  ): Promise<T> => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    app.scheduleRequest = async () => {
      if (body instanceof Error) throw body;
      return [{ status, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      return await run();
    } finally {
      app.scheduleRequest = original;
    }
  };

  suite.test("checkConnection: 200 with JSON user", async () => {
    const result = await withResponse(200, '{"email":"a@b.c"}', () => checkConnection(base));
    expect(result).to.deep.equal({ ok: true, message: "Connected as a@b.c" });
  });

  suite.test("checkConnection: 200 HTML is not a Komga endpoint", async () => {
    const result = await withResponse(200, "<html></html>", () => checkConnection(base));
    expect(result.message).to.equal("That URL is not a Komga API endpoint");
  });

  suite.test("checkConnection maps 401, 404 and transport failure", async () => {
    expect((await withResponse(401, "", () => checkConnection(base))).message).to.equal(
      "Invalid credentials",
    );
    expect((await withResponse(404, "<html>", () => checkConnection(base))).message).to.equal(
      "No Komga server at that URL",
    );
    expect(
      (await withResponse(0, new Error("boom"), () => checkConnection(base))).message,
    ).to.equal("Could not reach https://x");
  });

  suite.test("komgaFetch: empty body resolves undefined, empty base throws", async () => {
    expect(await withResponse(204, "", () => komgaFetch("/p", { baseUrl: base }))).to.equal(
      undefined,
    );
    let message = "";
    try {
      await komgaFetch("/p", { baseUrl: "" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).to.equal("No Komga server set");
  });

  suite.test("pickShareUrl prefers AniList, then falls back to the first link", async () => {
    const links = [
      { label: "Web", url: "w" },
      { label: "My Anime List", url: "m" },
      { label: "AniList", url: "a" },
    ];
    expect(pickShareUrl(links)).to.equal("a");
    expect(pickShareUrl([{ label: "Web", url: "w" }])).to.equal("w");
    expect(pickShareUrl([])).to.equal(undefined);
  });

  const series: SeriesDto = {
    id: "s1",
    libraryId: "l1",
    name: "Series",
    oneshot: false,
    booksCount: 10,
    booksReadCount: 4,
    booksUnreadCount: 5,
    booksInProgressCount: 1,
    metadata: {
      title: "Primary",
      summary: "",
      status: "ONGOING",
      genres: ["science fiction", "Ecchi"],
      tags: ["time travel"],
      language: "ja",
      readingDirection: "RIGHT_TO_LEFT",
      publisher: "Pub",
      ageRating: 0,
      totalBookCount: 12,
      alternateTitles: [
        { label: "en", title: "Alt One" },
        { label: "ja", title: "Alt Two" },
      ],
      links: [{ label: "MangaDex", url: "https://md" }],
    },
    booksMetadata: {
      summary: "Books summary",
      authors: [
        { name: "W1", role: "writer" },
        { name: "P1", role: "penciller" },
        { name: "W2", role: "writer" },
        { name: "C1", role: "colorist" },
      ],
    },
  };

  suite.test("toSourceManga maps every details field", async () => {
    const { mangaId, mangaInfo } = toSourceManga(series);
    expect(mangaId).to.equal("s1");
    expect(mangaInfo.primaryTitle).to.equal("Primary");
    expect(mangaInfo.secondaryTitles).to.deep.equal(["Alt One", "Alt Two"]);
    expect(mangaInfo.thumbnailUrl).to.match(/\/api\/v1\/series\/s1\/thumbnail$/);
    expect(mangaInfo.contentRating).to.equal(ContentRating.MATURE);
    expect(mangaInfo.status).to.equal("ongoing");
    expect(mangaInfo.author).to.equal("W1, W2");
    expect(mangaInfo.artist).to.equal("P1");
    expect(mangaInfo.synopsis).to.equal("Books summary");
    expect(mangaInfo.shareUrl).to.equal("https://md");
    expect(mangaInfo.tagGroups).to.deep.equal([
      {
        id: "genres",
        title: "Genres",
        tags: [
          { id: encodeTagId("genre", "science fiction"), title: "Science fiction" },
          { id: encodeTagId("genre", "Ecchi"), title: "Ecchi" },
        ],
      },
      {
        id: "tags",
        title: "Tags",
        tags: [{ id: encodeTagId("tag", "time travel"), title: "Time travel" }],
      },
    ]);
    expect(mangaInfo.additionalInfo).to.deep.equal({
      language: "ja",
      readingDirection: "RIGHT_TO_LEFT",
      publisher: "Pub",
      books: "10",
      totalBooks: "12",
      booksRead: "4",
      booksUnread: "5",
      booksInProgress: "1",
    });
  });

  suite.test("toSourceManga prefers the series summary and omits an unknown total", async () => {
    const { mangaInfo } = toSourceManga({
      ...series,
      metadata: { ...series.metadata, summary: "Series summary", totalBookCount: undefined },
    });
    expect(mangaInfo.synopsis).to.equal("Series summary");
    expect(mangaInfo.additionalInfo).to.not.have.property("totalBooks");
  });

  suite.test("toSourceManga tolerates missing metadata fields", async () => {
    const bare = {
      ...series,
      metadata: {
        ...series.metadata,
        summary: "",
        genres: undefined,
        tags: undefined,
        alternateTitles: undefined,
        links: undefined,
      },
      booksMetadata: { summary: "" },
    } as unknown as SeriesDto;
    const { mangaInfo } = toSourceManga(bare);
    expect(mangaInfo.shareUrl).to.equal(undefined);
    expect(mangaInfo.secondaryTitles).to.deep.equal([]);
    expect(mangaInfo.tagGroups?.map((group) => group.tags)).to.deep.equal([[], []]);
    expect(mangaInfo.author).to.equal(undefined);
    expect(mangaInfo.artist).to.equal(undefined);
  });

  suite.test("getMangaDetails maps 404 to Series not found and keeps other messages", async () => {
    const message = async (status: number): Promise<string> => {
      try {
        await withResponse(status, "", () => getMangaDetails("s1"));
      } catch (err) {
        return (err as Error).message;
      }
      return "";
    };
    expect(await message(404)).to.equal("Series not found");
    expect(await message(500)).to.equal("Komga returned 500");
  });

  await suite.run();
}
