import {
  ContentRating,
  type DiscoverSection,
  DiscoverSectionType,
  type SourceManga,
  type TestLogger,
  type UpdateManager,
} from "@paperback/types";
import { expect } from "chai";

import {
  getChapterDetails,
  getChapters,
  processTitlesForUpdates,
} from "../Komga/implementations/chapter-providing/main.js";
import {
  decideUpdatePriorities,
  toChapter,
} from "../Komga/implementations/chapter-providing/parsers.js";
import {
  onDeckItem,
  seriesItem,
  sortNearlyFinished,
} from "../Komga/implementations/discover-section/items.js";
import {
  getDiscoverSectionItems,
  getDiscoverSections,
} from "../Komga/implementations/discover-section/main.js";
import { DISCOVER_SECTIONS } from "../Komga/implementations/discover-section/sections.js";
import { getMangaDetails } from "../Komga/implementations/manga/main.js";
import { pickShareUrl, toSourceManga } from "../Komga/implementations/manga/parsers.js";
import {
  chapterForProgress,
  getMangaProgress,
  getMangaProgressManagementForm,
  processChapterReadActionQueue,
} from "../Komga/implementations/progress/main.js";
import { KomgaSearchForm } from "../Komga/implementations/search-results/forms.js";
import {
  SORT_OPTIONS,
  buildSearchBody,
  getAdvancedSearchForm,
  getSearchResults,
  getSortingOptions,
} from "../Komga/implementations/search-results/main.js";
import { checkConnection, classifyConnection } from "../Komga/implementations/shared/connection.js";
import { parseContentRating } from "../Komga/implementations/shared/content-rating.js";
import { isHiddenSeries } from "../Komga/implementations/shared/filters.js";
import type { BookDto, SeriesDto } from "../Komga/implementations/shared/models.js";
import {
  getAdultGenres,
  getHideAdultContent,
  getIncludeOneshots,
  getSectionStyle,
  getSelectedLibraries,
  setAdultGenres,
  setHideAdultContent,
  setIncludeOneshots,
  setSectionStyle,
  setSelectedLibraries,
} from "../Komga/implementations/shared/state.js";
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

  const sourceManga = {
    mangaId: "s1",
    mangaInfo: { additionalInfo: { language: "ja" } },
  } as unknown as SourceManga;
  const book = (over: Partial<BookDto> = {}): BookDto => ({
    id: "b1",
    seriesId: "s1",
    seriesTitle: "Series",
    name: "Book",
    number: 16,
    oneshot: false,
    created: "2026-01-02T00:00:00Z",
    fileLastModified: "2026-01-01T00:00:00Z",
    media: { mediaType: "application/zip", pagesCount: 3, status: "READY" },
    metadata: { title: "", number: "16", numberSort: 16.5 },
    ...over,
  });

  suite.test(
    "decideUpdatePriorities: complete walk skips unseen, partial leaves them",
    async () => {
      const full = decideUpdatePriorities(["a", "b"], new Set(["a"]), true);
      expect(full.get("a")).to.equal("high");
      expect(full.get("b")).to.equal("skip");
      const partial = decideUpdatePriorities(["a", "b"], new Set(["a"]), false);
      expect(partial.get("a")).to.equal("high");
      expect(partial.has("b")).to.equal(false);
    },
  );

  suite.test("toChapter maps title, volume, language and dates", async () => {
    const chapter = toChapter(
      book({ metadata: { title: "Vol.02 Ch.016 - The Aria", number: "16", numberSort: 16.5 } }),
      "",
      sourceManga,
    );
    expect(chapter.title).to.equal("The Aria");
    expect(chapter.volume).to.equal(2);
    expect(chapter.langCode).to.equal("UNKNOWN");
    expect(chapter.chapNum).to.equal(16);
    expect(chapter.sortingIndex).to.equal(16.5);
    expect(chapter.creationDate?.toISOString()).to.equal("2026-01-02T00:00:00.000Z");
    expect(chapter.publishDate?.toISOString()).to.equal("2026-01-01T00:00:00.000Z");
    expect(chapter.chapterId).to.equal("b1");
  });

  suite.test(
    "toChapter: no title gives empty title and volume 0, upper-cases language",
    async () => {
      const chapter = toChapter(book(), "en", sourceManga);
      expect(chapter.title).to.equal("");
      expect(chapter.volume).to.equal(0);
      expect(chapter.langCode).to.equal("EN");
    },
  );

  suite.test("toChapter: releaseDate wins over fileLastModified", async () => {
    const chapter = toChapter(
      book({ metadata: { title: "", number: "16", numberSort: 16, releaseDate: "2025-05-05" } }),
      "en",
      sourceManga,
    );
    expect(chapter.publishDate?.toISOString()).to.equal("2025-05-05T00:00:00.000Z");
  });

  suite.test("getChapters posts the allOf condition and maps books", async () => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; method?: string; body?: string }[] = [];
    app.scheduleRequest = async (req: { url: string; method?: string; body?: string }) => {
      requests.push(req);
      const body = JSON.stringify({ content: [book()], last: true, number: 0 });
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      const chapters = await getChapters(sourceManga);
      expect(chapters.length).to.equal(1);
      expect(chapters[0]!.langCode).to.equal("JA");
      expect(requests.length).to.equal(1);
      expect(requests[0]!.method).to.equal("POST");
      expect(requests[0]!.url).to.contain("/api/v1/books/list");
      expect(requests[0]!.url).to.contain("unpaged=true");
      expect(JSON.parse(requests[0]!.body!)).to.deep.equal({
        condition: {
          allOf: [
            { seriesId: { operator: "is", value: "s1" } },
            { deleted: { operator: "isFalse" } },
            { mediaStatus: { operator: "is", value: "READY" } },
          ],
        },
      });
    } finally {
      app.scheduleRequest = original;
    }
  });

  suite.test("getChapterDetails builds page urls, converting unsupported types", async () => {
    const pages = JSON.stringify([
      { number: 1, mediaType: "image/jpeg" },
      { number: 2, mediaType: "image/avif" },
    ]);
    const chapter = toChapter(book(), "en", sourceManga);
    const details = await withResponse(200, pages, () => getChapterDetails(chapter));
    expect(details.id).to.equal("b1");
    expect(details.mangaId).to.equal("s1");
    const urls = (details as { pages: string[] }).pages;
    expect(urls.length).to.equal(2);
    expect(urls[0]).to.match(/\/api\/v1\/books\/b1\/pages\/1$/);
    expect(urls[1]).to.match(/\/api\/v1\/books\/b1\/pages\/2\?convert=png$/);
  });

  const fakeUpdateManager = (queued: string[]) => {
    const calls: [string, string][] = [];
    const manager = {
      getQueuedItems: () => queued.map((id) => ({ mangaId: id }) as unknown as SourceManga),
      setUpdatePriority: async (id: string, priority: string) => {
        calls.push([id, priority]);
      },
    } as unknown as UpdateManager;
    return { manager, calls };
  };

  suite.test("processTitlesForUpdates: newer series high, other queued skip", async () => {
    const { manager, calls } = fakeUpdateManager(["new", "old", "other"]);
    const body = JSON.stringify({
      content: [
        { id: "new", lastModified: "2026-06-01T12:00:00Z" },
        { id: "old", lastModified: "2026-06-01T09:00:00Z" },
      ],
      last: false,
      number: 0,
    });
    await withResponse(200, body, () =>
      processTitlesForUpdates(manager, new Date("2026-06-01T11:00:00Z")),
    );
    expect(Object.fromEntries(calls)).to.deep.equal({ new: "high", old: "skip", other: "skip" });
  });

  suite.test("processTitlesForUpdates: a failed request changes nothing", async () => {
    const { manager, calls } = fakeUpdateManager(["a"]);
    await withResponse(0, new Error("boom"), () =>
      processTitlesForUpdates(manager, new Date("2026-06-01T11:00:00Z")),
    );
    await withResponse(500, "", () =>
      processTitlesForUpdates(manager, new Date("2026-06-01T11:00:00Z")),
    );
    expect(calls.length).to.equal(0);
  });

  suite.test("processTitlesForUpdates: nothing queued or no date does nothing", async () => {
    const empty = fakeUpdateManager([]);
    await withResponse(200, "{}", () => processTitlesForUpdates(empty.manager, new Date()));
    const noDate = fakeUpdateManager(["a"]);
    await withResponse(200, "{}", () => processTitlesForUpdates(noDate.manager));
    expect(empty.calls.length + noDate.calls.length).to.equal(0);
  });

  suite.test("processTitlesForUpdates: the 50-page cap leaves unseen series alone", async () => {
    const { manager, calls } = fakeUpdateManager(["new", "unseen"]);
    const body = JSON.stringify({
      content: [{ id: "new", lastModified: "2026-06-01T12:00:00Z" }],
      last: false,
      number: 0,
    });
    await withResponse(200, body, () =>
      processTitlesForUpdates(manager, new Date("2026-06-01T11:00:00Z")),
    );
    expect(Object.fromEntries(calls)).to.deep.equal({ new: "high" });
  });

  suite.test("toChapter falls back to numberSort for a blank or non-numeric number", async () => {
    const num = (number: string) =>
      toChapter(book({ metadata: { title: "", number, numberSort: 7.5 } }), "en", sourceManga)
        .chapNum;
    expect(num("abc")).to.equal(7.5);
    expect(num("12a")).to.equal(7.5);
    expect(num("")).to.equal(7.5);
    expect(num("12.5")).to.equal(12.5);
  });

  suite.test("processTitlesForUpdates: an invalid date never completes the walk", async () => {
    const { manager, calls } = fakeUpdateManager(["new", "unseen"]);
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    let n = 0;
    app.scheduleRequest = async () => {
      if (++n > 1) throw new Error("boom");
      const body = JSON.stringify({
        content: [
          { id: "new", lastModified: "2026-06-01T12:00:00Z" },
          { id: "bad", lastModified: "garbage" },
        ],
        last: false,
        number: 0,
      });
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      await processTitlesForUpdates(manager, new Date("2026-06-01T11:00:00Z"));
    } finally {
      app.scheduleRequest = original;
    }
    expect(n).to.equal(2);
    expect(calls.length).to.equal(0);
  });

  suite.test(
    "processTitlesForUpdates: one throwing setUpdatePriority does not stop the rest",
    async () => {
      const calls: string[] = [];
      const manager = {
        getQueuedItems: () => ["a", "b"].map((id) => ({ mangaId: id }) as unknown as SourceManga),
        setUpdatePriority: async (id: string) => {
          calls.push(id);
          if (id === "a") throw new Error("nope");
        },
      } as unknown as UpdateManager;
      const body = JSON.stringify({ content: [], last: true, number: 0 });
      await withResponse(200, body, () =>
        processTitlesForUpdates(manager, new Date("2026-06-01T11:00:00Z")),
      );
      expect(calls).to.deep.equal(["a", "b"]);
    },
  );

  suite.test("buildSearchBody decodes tag ids into is and isNot conditions", async () => {
    const body = buildSearchBody(
      "x",
      {
        genres: {
          [encodeTagId("genre", "Science Fiction")]: "included",
          [encodeTagId("genre", "日本語")]: "excluded",
        },
      },
      [],
    );
    expect(body).to.deep.equal({
      fullTextSearch: "x",
      condition: {
        allOf: [
          { genre: { operator: "is", value: "Science Fiction" } },
          { genre: { operator: "isNot", value: "日本語" } },
        ],
      },
    });
  });

  suite.test("buildSearchBody leaves out condition when there is nothing to filter", async () => {
    const body = buildSearchBody("", undefined, []);
    expect(body).to.not.have.property("condition");
  });

  suite.test("buildSearchBody keeps the base conditions", async () => {
    const base = [{ oneShot: { operator: "isFalse" } }];
    const body = buildSearchBody("", { tags: { [encodeTagId("tag", "a")]: "included" } }, base);
    expect(body).to.deep.equal({
      fullTextSearch: "",
      condition: { allOf: [...base, { tag: { operator: "is", value: "a" } }] },
    });
  });

  suite.test("sorting options match the spec table", async () => {
    expect(SORT_OPTIONS.map((o) => [o.id, o.sort])).to.deep.equal([
      ["titleAsc", "metadata.titleSort,asc"],
      ["titleDesc", "metadata.titleSort,desc"],
      ["recentlyAdded", "created,desc"],
      ["recentlyUpdated", "lastModified,desc"],
      ["recentlyRead", "readDate,desc"],
      ["mostChapters", "booksCount,desc"],
    ]);
    const options = await getSortingOptions();
    expect(options.map((o) => o.id)).to.deep.equal(SORT_OPTIONS.map((o) => o.id));
  });

  suite.test("isHiddenSeries is false when adult content is shown", async () => {
    expect(isHiddenSeries(["Hentai"])).to.equal(false);
  });

  const captureRequests = async <T>(body: string, run: () => Promise<T>) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; body?: string }[] = [];
    app.scheduleRequest = async (request: { url: string; body?: string }) => {
      requests.push(request);
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      return { result: await run(), requests };
    } finally {
      app.scheduleRequest = original;
    }
  };

  const seriesJson = (n: number) =>
    JSON.stringify({
      content: Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        metadata: { title: `T${i}`, genres: [] },
      })),
    });

  suite.test("getSearchResults sends page, size and sort, and pages on a full page", async () => {
    const { result, requests } = await captureRequests(seriesJson(40), () =>
      getSearchResults(
        { title: "x" },
        { page: 2 },
        { id: "recentlyAdded", label: "Recently Added" },
      ),
    );
    expect(result.items.length).to.equal(40);
    expect(result.metadata).to.deep.equal({ page: 3 });
    const url = decodeURIComponent(requests[0]!.url);
    expect(url).to.contain("/api/v1/series/list");
    expect(url).to.contain("page=2");
    expect(url).to.contain("size=40");
    expect(url).to.contain("sort=created,desc");
    expect(JSON.parse(requests[0]!.body!).fullTextSearch).to.equal("x");
  });

  suite.test("getSearchResults stops on a short page and defaults to title sort", async () => {
    const { result, requests } = await captureRequests(seriesJson(3), () =>
      getSearchResults({ title: "" }, undefined, undefined),
    );
    expect(result.items.length).to.equal(3);
    expect(result.metadata).to.equal(undefined);
    expect(decodeURIComponent(requests[0]!.url)).to.contain("sort=metadata.titleSort,asc");
  });

  suite.test("getSearchResults returns no items when the transport fails", async () => {
    const result = await withResponse(0, new Error("down"), () =>
      getSearchResults({ title: "x" }, undefined, undefined),
    );
    expect(result).to.deep.equal({ items: [] });
  });

  suite.test("getSearchResults returns no items on an HTTP error", async () => {
    const result = await withResponse(500, "", () =>
      getSearchResults({ title: "x" }, undefined, undefined),
    );
    expect(result).to.deep.equal({ items: [] });
  });

  suite.test("getAdvancedSearchForm falls back to empty groups when lookups fail", async () => {
    const form = await withResponse(0, new Error("down"), () =>
      getAdvancedSearchForm({ title: "" }),
    );
    expect(form.getSections().length).to.equal(4);
    expect(form.getSearchQueryMetadata()).to.deep.equal({ filters: {} });
  });

  suite.test("getAdvancedSearchForm tolerates array metadata", async () => {
    const form = await withResponse(0, new Error("down"), () =>
      getAdvancedSearchForm({ title: "", metadata: [] as never }),
    );
    expect(form.getSearchQueryMetadata()).to.deep.equal({ filters: {} });
  });

  const withSearchState = async <T>(run: () => Promise<T>): Promise<T> => {
    const saved = {
      hide: getHideAdultContent(),
      genres: getAdultGenres(),
      libraries: getSelectedLibraries(),
      oneshots: getIncludeOneshots(),
    };
    try {
      return await run();
    } finally {
      setHideAdultContent(saved.hide);
      setAdultGenres(saved.genres);
      setSelectedLibraries(saved.libraries);
      setIncludeOneshots(saved.oneshots);
    }
  };

  suite.test("isHiddenSeries hides adult genres when hiding is on", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      expect(isHiddenSeries(["Hentai"])).to.equal(true);
      expect(isHiddenSeries(["Action"])).to.equal(false);
      setAdultGenres(["Gore"]);
      expect(isHiddenSeries(["gore"])).to.equal(true);
    });
  });

  suite.test("getSearchResults adds hidden-genre and scope conditions", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai", "Gore"]);
      setSelectedLibraries(["lib1", "lib2"]);
      setIncludeOneshots(false);
      const { requests } = await captureRequests(seriesJson(0), () =>
        getSearchResults({ title: "" }, undefined, undefined),
      );
      const body = JSON.parse(requests[0]!.body!);
      expect(body.condition.allOf).to.deep.equal([
        { genre: { operator: "isNot", value: "hentai" } },
        { genre: { operator: "isNot", value: "gore" } },
        {
          anyOf: [
            { libraryId: { operator: "is", value: "lib1" } },
            { libraryId: { operator: "is", value: "lib2" } },
          ],
        },
        { oneShot: { operator: "isFalse" } },
      ]);
    });
  });

  suite.test("getSearchResults accepts array metadata", async () => {
    const { result } = await captureRequests(seriesJson(2), () =>
      getSearchResults({ title: "x", metadata: [] as never }, undefined, undefined),
    );
    expect(result.items.length).to.equal(2);
  });

  suite.test("getAdvancedSearchForm loads every collections page", async () => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const pages: string[] = [];
    app.scheduleRequest = async (request: { url: string }) => {
      const url = decodeURIComponent(request.url);
      let body = "[]";
      if (url.includes("/api/v1/collections")) {
        pages.push(url);
        const second = url.includes("page=1");
        body = JSON.stringify({
          content: [second ? { id: "c2", name: "Two" } : { id: "c1", name: "One" }],
          last: second,
        });
      }
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      const form = await getAdvancedSearchForm({ title: "" });
      expect(pages.length).to.equal(2);
      const row = form.getSections().find((s) => s.id === "tags-collections")!.items[0] as {
        form?: { props?: { items?: { id: string }[] } };
      };
      const ids = JSON.stringify(row);
      expect(ids).to.contain(encodeTagId("collection", "c1"));
      expect(ids).to.contain(encodeTagId("collection", "c2"));
    } finally {
      app.scheduleRequest = original;
    }
  });

  suite.test("KomgaSearchForm keeps saved selections", async () => {
    const id = encodeTagId("genre", "Action");
    const form = new KomgaSearchForm(
      { title: "", metadata: { filters: { genres: { [id]: "included" } } } },
      [{ id: "genres", title: "Genres", tags: [{ id, title: "Action" }] }],
    );
    const row = form.getSections()[0]!.items[0] as unknown as { value: string };
    expect(row.value).to.equal("1 items");
    expect(form.getSearchQueryMetadata()).to.deep.equal({
      filters: { genres: { [id]: "included" } },
    });
  });

  suite.test("KomgaSearchForm tolerates non-object metadata and filters", async () => {
    const a = new KomgaSearchForm({ title: "", metadata: "x" as never }, []);
    expect(a.getSearchQueryMetadata()).to.deep.equal({ filters: {} });
    const b = new KomgaSearchForm({ title: "", metadata: { filters: "x" as never } }, []);
    expect(b.getSearchQueryMetadata()).to.deep.equal({ filters: {} });
  });

  suite.test("getAdvancedSearchForm tolerates non-array lookups", async () => {
    const form = await withResponse(200, '{"a":1}', () => getAdvancedSearchForm({ title: "" }));
    expect(form.getSections().length).to.equal(4);
  });

  const seriesFixture = (over: Partial<SeriesDto> = {}): SeriesDto =>
    ({
      id: "s1",
      name: "Name",
      booksCount: 10,
      booksReadCount: 2,
      booksUnreadCount: 8,
      metadata: {
        title: "Title",
        summary: "Sum",
        status: "ONGOING",
        publisher: "Pub",
        genres: [],
      },
      ...over,
    }) as unknown as SeriesDto;

  const bookFixture = (over: Partial<BookDto> = {}): BookDto =>
    ({
      id: "b1",
      seriesId: "s1",
      seriesTitle: "Series",
      name: "Book",
      oneshot: false,
      media: { pagesCount: 30 },
      metadata: { title: "Chapter 1" },
      ...over,
    }) as unknown as BookDto;

  suite.test("sortNearlyFinished keeps unread series, fewest unread first", async () => {
    const input = [5, 0, 1, 3].map((n) => seriesFixture({ booksUnreadCount: n }));
    expect(sortNearlyFinished(input).map((s) => s.booksUnreadCount)).to.deep.equal([1, 3, 5]);
  });

  suite.test("sortNearlyFinished takes the first 40", async () => {
    const input = Array.from({ length: 60 }, (_, i) => seriesFixture({ booksUnreadCount: i + 1 }));
    expect(sortNearlyFinished(input).length).to.equal(40);
  });

  suite.test("onDeckItem builds the item type for each style", async () => {
    expect(onDeckItem(bookFixture(), "hero").type).to.equal("featuredCarouselItem");
    expect(onDeckItem(bookFixture(), "large").type).to.equal("prominentCarouselItem");
    expect(onDeckItem(bookFixture(), "simple").type).to.equal("simpleCarouselItem");
    const item = onDeckItem(bookFixture(), "simple");
    expect(item.type === "simpleCarouselItem" && item.title).to.equal("Chapter 1");
    expect(item.type === "simpleCarouselItem" && item.mangaId).to.equal("s1");
  });

  suite.test("seriesItem subtitles and hero details", async () => {
    const large = seriesItem(seriesFixture(), "large");
    expect(large.type === "prominentCarouselItem" && large.subtitle).to.equal("2 of 10 read");
    const hero = seriesItem(seriesFixture(), "hero");
    expect(hero.type).to.equal("featuredCarouselItem");
    if (hero.type === "featuredCarouselItem") {
      expect(hero.summary).to.equal("Sum");
      expect(hero.infoItems?.length).to.equal(2);
    }
    expect(seriesItem(seriesFixture(), "simple").type).to.equal("simpleCarouselItem");
  });

  suite.test("getDiscoverSections lists the six sections and skips hidden ones", async () => {
    expect(DISCOVER_SECTIONS.map((s) => s.id)).to.deep.equal([
      "onDeck",
      "keepReading",
      "nearlyFinished",
      "recentlyAdded",
      "recentlyUpdated",
      "genres",
    ]);
    const saved = getSectionStyle("genres");
    const savedDeck = getSectionStyle("onDeck");
    try {
      setSectionStyle("genres", "hidden");
      setSectionStyle("onDeck", "hero");
      const sections = await getDiscoverSections();
      expect(sections.map((s) => s.id)).to.not.include("genres");
      expect(sections.find((s) => s.id === "onDeck")?.type).to.equal(DiscoverSectionType.featured);
      setSectionStyle("genres", "large");
      const again = await getDiscoverSections();
      expect(again.find((s) => s.id === "genres")?.type).to.equal(DiscoverSectionType.genres);
    } finally {
      setSectionStyle("genres", saved);
      setSectionStyle("onDeck", savedDeck);
    }
  });

  const sectionFor = (id: string): DiscoverSection => ({
    id,
    title: id,
    type: DiscoverSectionType.simpleCarousel,
  });

  suite.test("getDiscoverSectionItems returns empty items on any error", async () => {
    for (const { id } of DISCOVER_SECTIONS) {
      const result = await withResponse(0, new Error("down"), () =>
        getDiscoverSectionItems(sectionFor(id), undefined),
      );
      expect(result).to.deep.equal({ items: [] });
    }
    const http = await withResponse(500, "", () =>
      getDiscoverSectionItems(sectionFor("keepReading"), undefined),
    );
    expect(http).to.deep.equal({ items: [] });
    const unknown = await getDiscoverSectionItems(sectionFor("nope"), undefined);
    expect(unknown).to.deep.equal({ items: [] });
  });

  suite.test("Keep Reading body carries read status, hidden genres and scope", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      setSelectedLibraries(["lib1"]);
      setIncludeOneshots(false);
      const { requests } = await captureRequests(seriesJson(0), () =>
        getDiscoverSectionItems(sectionFor("keepReading"), undefined),
      );
      expect(requests[0]!.url).to.contain("/api/v1/series/list");
      expect(requests[0]!.url).to.contain("sort=readProgress.readDate%2Cdesc");
      expect(JSON.parse(requests[0]!.body!).condition.allOf).to.deep.equal([
        { readStatus: { operator: "is", value: "IN_PROGRESS" } },
        { genre: { operator: "isNot", value: "hentai" } },
        { anyOf: [{ libraryId: { operator: "is", value: "lib1" } }] },
        { oneShot: { operator: "isFalse" } },
      ]);
    });
  });

  suite.test("Keep Reading pages by 40 and Nearly Finished is one page", async () => {
    const full = await captureRequests(seriesJson(40), () =>
      getDiscoverSectionItems(sectionFor("keepReading"), { page: 1 }),
    );
    expect(full.result.metadata).to.deep.equal({ page: 2 });
    expect(full.requests[0]!.url).to.contain("page=1");
    const short = await captureRequests(seriesJson(3), () =>
      getDiscoverSectionItems(sectionFor("keepReading"), undefined),
    );
    expect(short.result.metadata).to.equal(undefined);
    const nearly = await captureRequests(seriesJson(40), () =>
      getDiscoverSectionItems(sectionFor("nearlyFinished"), undefined),
    );
    expect(nearly.result.metadata).to.equal(undefined);
    expect(nearly.requests[0]!.url).to.contain("unpaged=true");
  });

  const onDeckSetup = (books: BookDto[], hiddenSeriesIds: string[]) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; body?: string }[] = [];
    const reply = (data: unknown) => [
      { status: 200, headers: {} },
      new TextEncoder().encode(JSON.stringify(data)).buffer,
    ];
    app.scheduleRequest = async (request: { url: string; body?: string }) => {
      requests.push(request);
      if (request.url.includes("/books/ondeck")) return reply({ content: books });
      return reply({ content: hiddenSeriesIds.map((id) => ({ id })) });
    };
    return {
      requests,
      restore: () => {
        app.scheduleRequest = original;
      },
    };
  };

  suite.test("On Deck drops books of hidden series", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      const setup = onDeckSetup(
        [bookFixture({ id: "a", seriesId: "bad" }), bookFixture({ id: "b", seriesId: "ok" })],
        ["bad"],
      );
      try {
        const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
        expect(result.items.map((i) => "mangaId" in i && i.mangaId)).to.deep.equal(["ok"]);
        const lookup = setup.requests.find((r) => r.url.includes("/series/list"))!;
        expect(lookup.url).to.contain("unpaged=true");
        expect(JSON.parse(lookup.body!).condition.anyOf).to.deep.equal([
          { genre: { operator: "is", value: "hentai" } },
        ]);
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("On Deck drops one-shot books when one-shots are excluded", async () => {
    await withSearchState(async () => {
      setHideAdultContent(false);
      const books = [bookFixture({ id: "a", oneshot: true }), bookFixture({ id: "b" })];
      setIncludeOneshots(false);
      let setup = onDeckSetup(books, []);
      try {
        const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
        expect(result.items.length).to.equal(1);
        expect(setup.requests.some((r) => r.url.includes("/series/list"))).to.equal(false);
      } finally {
        setup.restore();
      }
      setIncludeOneshots(true);
      setup = onDeckSetup(books, []);
      try {
        const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
        expect(result.items.length).to.equal(2);
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("On Deck sends the library scope", async () => {
    await withSearchState(async () => {
      setSelectedLibraries(["lib1"]);
      const { requests } = await captureRequests('{"content":[]}', () =>
        getDiscoverSectionItems(sectionFor("onDeck"), { page: 2 }),
      );
      expect(requests[0]!.url).to.contain("library_id=lib1");
      expect(requests[0]!.url).to.contain("page=2");
    });
  });

  suite.test("Recently Added filters hidden genres and excludes one-shots", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      setIncludeOneshots(false);
      const body = JSON.stringify({
        content: [
          { id: "a", metadata: { title: "A", genres: ["Hentai"] } },
          { id: "b", metadata: { title: "B", genres: ["Action"] } },
        ],
      });
      const { result, requests } = await captureRequests(body, () =>
        getDiscoverSectionItems(sectionFor("recentlyAdded"), undefined),
      );
      expect(requests[0]!.url).to.contain("/api/v1/series/new");
      expect(requests[0]!.url).to.contain("oneshot=false");
      expect(result.items.map((i) => "mangaId" in i && i.mangaId)).to.deep.equal(["b"]);
    });
  });

  suite.test("Recently Updated uses the updated endpoint", async () => {
    const { requests } = await captureRequests(seriesJson(1), () =>
      getDiscoverSectionItems(sectionFor("recentlyUpdated"), undefined),
    );
    expect(requests[0]!.url).to.contain("/api/v1/series/updated");
  });

  suite.test(
    "Genres drops adult genres, scopes to libraries and builds search queries",
    async () => {
      await withSearchState(async () => {
        setHideAdultContent(true);
        setAdultGenres(["hentai"]);
        setSelectedLibraries(["lib1"]);
        const { result, requests } = await captureRequests('["Action","Hentai","日本語"]', () =>
          getDiscoverSectionItems(sectionFor("genres"), undefined),
        );
        expect(requests[0]!.url).to.contain("/api/v1/genres");
        expect(requests[0]!.url).to.contain("library_id=lib1");
        expect(result.items.length).to.equal(2);
        expect(result.items[1]).to.deep.equal({
          type: "genresCarouselItem",
          name: "日本語",
          searchQuery: {
            title: "",
            metadata: { filters: { genres: { [encodeTagId("genre", "日本語")]: "included" } } },
          },
        });
      });
    },
  );

  const progressChapters = (indexes: number[]) =>
    indexes.map((n) => ({ chapterId: `c${n}`, chapNum: n, title: "", sortingIndex: n }) as never);

  suite.test("chapterForProgress picks the highest index at or below the value", async () => {
    const chapters = progressChapters([1, 2, 3]);
    expect(chapterForProgress(chapters, 2.5)?.chapterId).to.equal("c2");
    expect(chapterForProgress(chapters, 0)).to.equal(undefined);
    expect(chapterForProgress(chapters, 10)?.chapterId).to.equal("c3");
  });

  const routeRequests = async <T>(
    routes: (request: { url: string; method?: string }) => string,
    run: () => Promise<T>,
  ) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; method?: string; body?: string }[] = [];
    app.scheduleRequest = async (request: { url: string; method?: string; body?: string }) => {
      requests.push(request);
      return [{ status: 200, headers: {} }, new TextEncoder().encode(routes(request)).buffer];
    };
    try {
      return { result: await run(), requests };
    } finally {
      app.scheduleRequest = original;
    }
  };

  const progressServer =
    (lastRead: number) =>
    (request: { url: string }): string => {
      if (request.url.includes("/books/list")) {
        const book = (id: string, n: number) =>
          bookFixture({
            id,
            number: n,
            metadata: { title: `Chapter ${n}`, number: String(n), numberSort: n },
          } as Partial<BookDto>);
        return JSON.stringify({
          content: [book("b2", 2), book("b1", 1), book("b3", 3)],
          last: true,
          number: 0,
        });
      }
      return JSON.stringify({ lastReadContinuousNumberSort: lastRead });
    };

  suite.test("getMangaProgress returns undefined when nothing is read", async () => {
    const { result } = await routeRequests(progressServer(0), () => getMangaProgress(sourceManga));
    expect(result).to.equal(undefined);
  });

  suite.test("getMangaProgress finds the chapter and never throws", async () => {
    const { result } = await routeRequests(progressServer(2), () => getMangaProgress(sourceManga));
    expect(result?.lastReadChapter.chapterId).to.equal("b2");
    const failed = await withResponse(0, new Error("down"), () => getMangaProgress(sourceManga));
    expect(failed).to.equal(undefined);
  });

  suite.test("processChapterReadActionQueue reports every action as failed offline", async () => {
    const actions = [
      { id: "a1", chapterId: "b1" },
      { id: "a2", chapterId: "b2" },
    ] as never;
    const result = await withResponse(0, new Error("down"), () =>
      processChapterReadActionQueue(actions),
    );
    expect(result.successfulItems).to.deep.equal([]);
    expect(result.failedItems).to.deep.equal(["a1", "a2"]);
  });

  suite.test("processChapterReadActionQueue lists each id once when results mix", async () => {
    const actions = [
      { id: "a1", chapterId: "b1" },
      { id: "a2", chapterId: "b2" },
    ] as never;
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    let calls = 0;
    app.scheduleRequest = async () => [
      { status: calls++ === 0 ? 200 : 500, headers: {} },
      new TextEncoder().encode("").buffer,
    ];
    try {
      const result = await processChapterReadActionQueue(actions);
      expect(result.successfulItems).to.deep.equal(["a1"]);
      expect(result.failedItems).to.deep.equal(["a2"]);
    } finally {
      app.scheduleRequest = original;
    }
  });

  suite.test("progress form Mark Read shows an error footer instead of throwing", async () => {
    const form = (await routeRequests(progressServer(0), () =>
      getMangaProgressManagementForm(sourceManga),
    ).then((r) => r.result)) as unknown as {
      handleMarkRead(): Promise<void>;
      getSections(): { items?: unknown; footer?: string }[];
    };
    await withResponse(500, "", () => form.handleMarkRead());
    const footers = JSON.stringify(form.getSections());
    expect(footers).to.contain("Could not mark read: Komga returned 500");
  });

  suite.test("processChapterReadActionQueue patches each book as completed", async () => {
    const actions = [
      { id: "a1", chapterId: "b1" },
      { id: "a2", chapterId: "b2" },
    ] as never;
    const { result, requests } = await routeRequests(
      () => "",
      () => processChapterReadActionQueue(actions),
    );
    expect(result.successfulItems).to.deep.equal(["a1", "a2"]);
    expect(requests[0]!.method).to.equal("PATCH");
    expect(requests[0]!.url).to.contain("/api/v1/books/b1/read-progress");
    expect(JSON.parse(requests[0]!.body!)).to.deep.equal({ completed: true });
  });

  suite.test("progress form submit sends the chosen chapter's sort value", async () => {
    const { requests } = await routeRequests(progressServer(0), async () => {
      const form = (await getMangaProgressManagementForm(sourceManga)) as unknown as {
        requiresExplicitSubmission: boolean;
        handleSelect(value: string[]): Promise<void>;
        formDidSubmit(): Promise<void>;
      };
      expect(form.requiresExplicitSubmission).to.equal(true);
      await form.handleSelect(["b2"]);
      await form.formDidSubmit();
    });
    const put = requests.find((r) => r.method === "PUT")!;
    expect(put.url).to.contain("/api/v2/series/s1/read-progress/tachiyomi");
    expect(JSON.parse(put.body!)).to.deep.equal({ lastBookNumberSortRead: 2 });
  });

  suite.test("progress form submit with No chapters read deletes the progress", async () => {
    const { requests } = await routeRequests(progressServer(2), async () => {
      const form = (await getMangaProgressManagementForm(sourceManga)) as unknown as {
        handleSelect(value: string[]): Promise<void>;
        formDidSubmit(): Promise<void>;
      };
      await form.handleSelect(["unread"]);
      await form.formDidSubmit();
    });
    const del = requests.find((r) => r.method === "DELETE")!;
    expect(del.url).to.contain("/api/v1/series/s1/read-progress");
    expect(requests.some((r) => r.method === "PUT")).to.equal(false);
  });

  await suite.run();
}
