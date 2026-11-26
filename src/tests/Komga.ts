import {
  ContentRating,
  type DiscoverSection,
  DiscoverSectionType,
  SourceIntents,
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
  groupNewBooks,
  toChapter,
} from "../Komga/implementations/chapter-providing/parsers.js";
import {
  chapterUpdateItem,
  onDeckItem,
  seriesItem,
  sortNearlyFinished,
} from "../Komga/implementations/discover-section/items.js";
import {
  getDiscoverSectionItems,
  getDiscoverSections,
} from "../Komga/implementations/discover-section/main.js";
import { DISCOVER_SECTIONS } from "../Komga/implementations/discover-section/sections.js";
import {
  applyManagedCollectionChanges,
  getManagedCollectionItems,
  getManagedCollections,
} from "../Komga/implementations/managed-collection/main.js";
import { getMangaDetails, relationSections } from "../Komga/implementations/manga/main.js";
import {
  pickShareUrl,
  staffSection,
  toSourceManga,
} from "../Komga/implementations/manga/parsers.js";
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
  resolveSort,
} from "../Komga/implementations/search-results/main.js";
import { KomgaContentForm } from "../Komga/implementations/settings-form/forms/content.js";
import { KomgaHomepageForm } from "../Komga/implementations/settings-form/forms/homepage.js";
import { KomgaSettingsForm } from "../Komga/implementations/settings-form/forms/root.js";
import { KomgaServerForm } from "../Komga/implementations/settings-form/forms/server.js";
import { getSettingsForm } from "../Komga/implementations/settings-form/main.js";
import { resolveBookSeries } from "../Komga/implementations/shared/book-series.js";
import { checkConnection, classifyConnection } from "../Komga/implementations/shared/connection.js";
import { parseContentRating } from "../Komga/implementations/shared/content-rating.js";
import { isHiddenSeries } from "../Komga/implementations/shared/filters.js";
import { escapeLucene } from "../Komga/implementations/shared/lucene.js";
import type { BookDto, SeriesDto } from "../Komga/implementations/shared/models.js";
import {
  getAdultGenres,
  getApiKey,
  getBaseUrl,
  getCredentials,
  getHideAdultContent,
  getIncludeOneshots,
  getReadListEnabled,
  getSectionStyle,
  getSelectedLibraries,
  setAdultGenres,
  setApiKey,
  setBaseUrl,
  setCredentials,
  setHideAdultContent,
  setIncludeOneshots,
  setReadListEnabled,
  setSectionStyle,
  setSelectedLibraries,
} from "../Komga/implementations/shared/state.js";
import { chapterLabel, parseChapterTitle } from "../Komga/implementations/shared/titles.js";
import {
  authHeaders,
  base64EncodeUtf8,
  basicAuthHeader,
  decodeTagId,
  encodeTagId,
  errorMessage,
  normaliseBaseUrl,
} from "../Komga/implementations/shared/utils.js";
import { Komga } from "../Komga/main.js";
import sourceInfo from "../Komga/pbconfig.js";
import { KomgaInterceptor, shouldAuthorise } from "../Komga/services/interceptor.js";
import { buildUrl, komgaFetch, pageUrl, seriesThumbnail } from "../Komga/services/network.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Komga tests", logger);
  registerDefaultTests(suite, Komga, sourceInfo);

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
    ["Volna", 1, "Volna", undefined],
    ["Vol.NA Ch.1 Name", 1, "Name", undefined],
    ["Chapter 12abc", 12, "Chapter 12abc", undefined],
    ["Ch.5Extra", 5, "Ch.5Extra", undefined],
    ["Ch.3 \u2013 Name", 3, "Name", undefined],
    ["Ch.3 \u2014 Name", 3, "Name", undefined],
    ["Ch.3: Name", 3, "Name", undefined],
    ["Ch.3 | Name", 3, "Name", undefined],
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

  suite.test("authHeaders gives only X-API-Key with a key", async () => {
    expect(authHeaders({ username: "u", password: "p" }, "k1")).to.deep.equal({
      "X-API-Key": "k1",
    });
  });

  suite.test("authHeaders gives only Authorization without a key", async () => {
    expect(authHeaders({ username: "u", password: "p" }, "")).to.deep.equal({
      Authorization: basicAuthHeader("u", "p"),
    });
  });

  suite.test("setApiKey trims and getApiKey reads it back", async () => {
    const saved = getApiKey();
    try {
      setApiKey("  abc  ");
      expect(getApiKey()).to.equal("abc");
    } finally {
      setApiKey(saved);
    }
  });

  suite.test("interceptor sends X-API-Key and no Authorization when a key is set", async () => {
    const saved = getApiKey();
    try {
      setApiKey("secret");
      const out = await interceptor.interceptRequest({ url: `${own}/api`, method: "GET" });
      expect(out.headers).to.deep.equal({ "X-API-Key": "secret" });
      setApiKey("");
      const back = await interceptor.interceptRequest({ url: `${own}/api`, method: "GET" });
      expect(back.headers?.["Authorization"]).to.match(/^Basic /);
      expect(back.headers?.["X-API-Key"]).to.equal(undefined);
    } finally {
      setApiKey(saved);
    }
  });

  suite.test("interceptor never overwrites an existing X-API-Key or Authorization", async () => {
    const saved = getApiKey();
    try {
      for (const key of ["", "secret"]) {
        setApiKey(key);
        for (const headers of [
          { "x-api-key": "typed" },
          { "X-API-KEY": "typed" },
          { AUTHORIZATION: "Basic x" },
        ]) {
          const out = await interceptor.interceptRequest({
            url: `${own}/api`,
            method: "GET",
            headers,
          });
          expect(out.headers).to.deep.equal(headers);
        }
      }
    } finally {
      setApiKey(saved);
    }
  });

  suite.test("classifyConnection names an invalid API key", async () => {
    expect(
      classifyConnection({ status: 401, reached: true, baseUrl: base, usedApiKey: true }).message,
    ).to.equal("Invalid API key");
    expect(classifyConnection({ status: 401, reached: true, baseUrl: base }).message).to.equal(
      "Invalid credentials",
    );
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
      {
        id: "publishers",
        title: "Publisher",
        tags: [{ id: encodeTagId("publisher", "Pub"), title: "Pub" }],
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

  suite.test("toSourceManga sets isWebtoon from the reading direction", async () => {
    const withDirection = (readingDirection: string): SeriesDto => ({
      ...series,
      metadata: { ...series.metadata, readingDirection },
    });
    expect(toSourceManga(withDirection("WEBTOON")).mangaInfo.isWebtoon).to.equal(true);
    expect(toSourceManga(withDirection("LEFT_TO_RIGHT")).mangaInfo.isWebtoon).to.equal(false);
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
        publisher: undefined,
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

  suite.test("toChapter drops a title equal to the chapter number, not the position", async () => {
    const same = toChapter(
      book({
        number: 3,
        metadata: { title: "Chapter 16 - 16", number: "16", numberSort: 16 },
      }),
      "en",
      sourceManga,
    );
    expect(same.title).to.equal("");
    const different = toChapter(
      book({ number: 16, metadata: { title: "Ch.3 - 16", number: "3", numberSort: 3 } }),
      "en",
      sourceManga,
    );
    expect(different.title).to.equal("16");
  });

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

  const updateServer = async (
    booksResponse: (url: string) => string | Error,
    run: () => Promise<void>,
  ) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    app.scheduleRequest = async (request: { url: string }) => {
      let body: string;
      if (request.url.includes("/books/list")) {
        const response = booksResponse(request.url);
        if (response instanceof Error) throw response;
        body = response;
      } else {
        body = JSON.stringify({
          content: [
            { id: "a", lastModified: "2026-06-01T12:00:00Z" },
            { id: "b", lastModified: "2026-06-01T12:00:00Z" },
          ],
          last: true,
          number: 0,
        });
      }
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      await run();
    } finally {
      app.scheduleRequest = original;
    }
  };

  const recordingManager = (queued: string[], throwOn?: string) => {
    const priorities: [string, string][] = [];
    const chapters: [string, string[]][] = [];
    const manager = {
      getQueuedItems: () =>
        queued.map(
          (id) => ({ mangaId: id, mangaInfo: { additionalInfo: {} } }) as unknown as SourceManga,
        ),
      setUpdatePriority: async (id: string, priority: string) => {
        priorities.push([id, priority]);
      },
      setNewChapters: async (id: string, list: { chapterId: string }[] | undefined) => {
        chapters.push([id, (list ?? []).map((chapter) => chapter.chapterId)]);
        if (id === throwOn) throw new Error("nope");
      },
    } as unknown as UpdateManager;
    return { manager, priorities, chapters };
  };

  const updateCutoff = new Date("2026-06-01T11:00:00Z");

  suite.test("groupNewBooks stops at the first book at or before the cutoff", async () => {
    const cutoff = new Date("2026-06-01T00:00:00Z");
    const result = groupNewBooks(
      [
        book({ id: "x1", seriesId: "a", created: "2026-06-01T00:00:02Z" }),
        book({ id: "x2", seriesId: "a", created: "2026-06-01T00:00:01Z" }),
        book({ id: "x3", seriesId: "a", created: "2026-05-31T23:59:59Z" }),
      ],
      cutoff,
    );
    expect(result.reachedCutoff).to.equal(true);
    expect(result.bySeries.get("a")!.length).to.equal(2);
  });

  suite.test(
    "processTitlesForUpdates: new book is handed over, metadata-only edit skips",
    async () => {
      const { manager, priorities, chapters } = recordingManager(["a", "b"]);
      await updateServer(
        () =>
          JSON.stringify({
            content: [
              book({ id: "n1", seriesId: "a", created: "2026-06-01T12:00:00Z" }),
              book({ id: "o1", seriesId: "b", created: "2026-05-01T00:00:00Z" }),
            ],
            last: false,
            number: 0,
          }),
        () => processTitlesForUpdates(manager, updateCutoff),
      );
      expect(chapters).to.deep.equal([["a", ["n1"]]]);
      expect(Object.fromEntries(priorities)).to.deep.equal({ a: "high", b: "skip" });
    },
  );

  suite.test(
    "processTitlesForUpdates: a failed books request gives high, no chapters",
    async () => {
      for (const failure of [new Error("boom"), "not json"]) {
        const { manager, priorities, chapters } = recordingManager(["a", "b"]);
        await updateServer(
          () => failure,
          () => processTitlesForUpdates(manager, updateCutoff),
        );
        expect(chapters.length).to.equal(0);
        expect(Object.fromEntries(priorities)).to.deep.equal({ a: "high", b: "high" });
      }
    },
  );

  suite.test("processTitlesForUpdates: a capped book walk gives high for the rest", async () => {
    const { manager, priorities, chapters } = recordingManager(["a", "b"]);
    let pages = 0;
    await updateServer(
      () => {
        pages++;
        return JSON.stringify({
          content: [book({ id: `n${pages}`, seriesId: "a", created: "2026-06-01T12:00:00Z" })],
          last: false,
          number: 0,
        });
      },
      () => processTitlesForUpdates(manager, updateCutoff),
    );
    expect(pages).to.equal(10);
    expect(chapters.length).to.equal(1);
    expect(chapters[0]![1].length).to.equal(10);
    expect(Object.fromEntries(priorities)).to.deep.equal({ a: "high", b: "high" });
  });

  suite.test(
    "processTitlesForUpdates: one throwing setNewChapters does not stop the rest",
    async () => {
      const { manager, priorities, chapters } = recordingManager(["a", "b"], "a");
      await updateServer(
        () =>
          JSON.stringify({
            content: [
              book({ id: "n1", seriesId: "a", created: "2026-06-01T12:00:00Z" }),
              book({ id: "n2", seriesId: "b", created: "2026-06-01T12:00:00Z" }),
            ],
            last: true,
            number: 0,
          }),
        () => processTitlesForUpdates(manager, updateCutoff),
      );
      expect(chapters.map(([id]) => id)).to.deep.equal(["a", "b"]);
      expect(Object.fromEntries(priorities)).to.deep.equal({ a: "high", b: "high" });
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

  suite.test("buildSearchBody ORs included libraries and collections", async () => {
    const body = buildSearchBody(
      "",
      {
        libraries: {
          [encodeTagId("library", "L1")]: "included",
          [encodeTagId("library", "L2")]: "included",
          [encodeTagId("library", "L3")]: "excluded",
        },
        collections: {
          [encodeTagId("collection", "C1")]: "included",
          [encodeTagId("collection", "C2")]: "included",
        },
        genres: {
          [encodeTagId("genre", "A")]: "included",
          [encodeTagId("genre", "B")]: "included",
        },
      },
      [],
    );
    expect(body).to.deep.equal({
      fullTextSearch: "",
      condition: {
        allOf: [
          { libraryId: { operator: "isNot", value: "L3" } },
          {
            anyOf: [
              { libraryId: { operator: "is", value: "L1" } },
              { libraryId: { operator: "is", value: "L2" } },
            ],
          },
          {
            anyOf: [
              { collectionId: { operator: "is", value: "C1" } },
              { collectionId: { operator: "is", value: "C2" } },
            ],
          },
          { genre: { operator: "is", value: "A" } },
          { genre: { operator: "is", value: "B" } },
        ],
      },
    });
  });

  suite.test("buildSearchBody keeps a single included library as one anyOf", async () => {
    const body = buildSearchBody(
      "",
      { libraries: { [encodeTagId("library", "L1")]: "included" } },
      [],
    );
    expect(body).to.deep.equal({
      fullTextSearch: "",
      condition: { allOf: [{ anyOf: [{ libraryId: { operator: "is", value: "L1" } }] }] },
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
      ["bestMatch", "relevance"],
      ["titleAsc", "metadata.titleSort,asc"],
      ["titleDesc", "metadata.titleSort,desc"],
      ["recentlyAdded", "created,desc"],
      ["recentlyUpdated", "lastModified,desc"],
      ["recentlyRead", "readDate,desc"],
      ["mostChapters", "booksCount,desc"],
      ["releaseDate", "booksMetadata.releaseDate,desc"],
      ["random", "random"],
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

  suite.test("escapeLucene escapes every reserved character", async () => {
    expect(escapeLucene("Re:Zero (2011)")).to.equal("Re\\:Zero \\(2011\\)");
    expect(escapeLucene("plain text 123")).to.equal("plain text 123");
    expect(escapeLucene("a&&b||c")).to.equal("a\\&\\&b\\|\\|c");
    for (const ch of [
      "+",
      "-",
      "!",
      "(",
      ")",
      "{",
      "}",
      "[",
      "]",
      "^",
      '"',
      "~",
      "*",
      "?",
      ":",
      "\\",
      "/",
    ]) {
      expect(escapeLucene(`a${ch}b`)).to.equal(`a\\${ch}b`);
    }
  });

  suite.test("resolveSort picks relevance only when there is text", async () => {
    expect(resolveSort(undefined, "naruto", {})).to.equal("relevance");
    expect(resolveSort("bestMatch", "naruto", {})).to.equal("relevance");
    expect(resolveSort("bestMatch", "", {})).to.equal("metadata.titleSort,asc");
    expect(resolveSort(undefined, "", {})).to.equal("metadata.titleSort,asc");
    expect(resolveSort("titleDesc", "x", {})).to.equal("metadata.titleSort,desc");
    expect(resolveSort("unknown", "x", {})).to.equal("relevance");
  });

  suite.test("getSearchResults sends escaped text and relevance sort", async () => {
    const { result, requests } = await captureRequests(seriesJson(2), () =>
      getSearchResults({ title: "Re:Zero" }, undefined, undefined),
    );
    expect(result.items.length).to.equal(2);
    expect(decodeURIComponent(requests[0]!.url)).to.contain("sort=relevance");
    expect(JSON.parse(requests[0]!.body!).fullTextSearch).to.equal("Re\\:Zero");
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
    expect(form.getSections().length).to.equal(10);
    expect(form.getSearchQueryMetadata()).to.deep.equal({ filters: {} });
  });

  const search = (filters: Record<string, Record<string, "included" | "excluded">>, a?: string) =>
    buildSearchBody("", filters, [], a) as { condition: { allOf: object[] } };

  suite.test("buildSearchBody ORs included read statuses", async () => {
    const body = search({
      readStatus: {
        [encodeTagId("readStatus", "IN_PROGRESS")]: "included",
        [encodeTagId("readStatus", "READ")]: "included",
      },
    });
    expect(body.condition.allOf).to.deep.equal([
      {
        anyOf: [
          { readStatus: { operator: "is", value: "IN_PROGRESS" } },
          { readStatus: { operator: "is", value: "READ" } },
        ],
      },
    ]);
  });

  suite.test("buildSearchBody excludes a series status", async () => {
    const body = search({ seriesStatus: { [encodeTagId("seriesStatus", "ENDED")]: "excluded" } });
    expect(body.condition.allOf).to.deep.equal([
      { seriesStatus: { operator: "isNot", value: "ENDED" } },
    ]);
  });

  suite.test("buildSearchBody maps publishers and languages", async () => {
    const body = search({
      publishers: { [encodeTagId("publisher", "Shueisha")]: "included" },
      languages: { [encodeTagId("language", "ja")]: "excluded" },
    });
    expect(body.condition.allOf).to.deep.equal([
      { anyOf: [{ publisher: { operator: "is", value: "Shueisha" } }] },
      { language: { operator: "isNot", value: "ja" } },
    ]);
  });

  suite.test("buildSearchBody maps age ratings to isNull and Int values", async () => {
    const body = search({
      ageRatings: {
        [encodeTagId("ageRating", "None")]: "included",
        [encodeTagId("ageRating", "16")]: "included",
        [encodeTagId("ageRating", "18")]: "excluded",
        [encodeTagId("ageRating", "abc")]: "included",
      },
    });
    expect(body.condition.allOf).to.deep.equal([
      { ageRating: { operator: "isNot", value: 18 } },
      {
        anyOf: [
          { ageRating: { operator: "isNull" } },
          { ageRating: { operator: "is", value: 16 } },
        ],
      },
    ]);
    const none = search({ ageRatings: { [encodeTagId("ageRating", "None")]: "excluded" } });
    expect(none.condition.allOf).to.deep.equal([{ ageRating: { operator: "isNotNull" } }]);
  });

  suite.test("buildSearchBody maps author text to an object value", async () => {
    const body = buildSearchBody("", undefined, [], " Oda ") as { condition: { allOf: object[] } };
    expect(body.condition.allOf).to.deep.equal([
      { author: { operator: "is", value: { name: "Oda" } } },
    ]);
    expect(buildSearchBody("", undefined, [], "  ")).to.deep.equal({ fullTextSearch: "" });
  });

  suite.test("getSearchResults sends the author from the query metadata", async () => {
    const { requests } = await captureRequests(seriesJson(0), () =>
      getSearchResults({ title: "", metadata: { author: "Oda" } }, undefined, undefined),
    );
    expect(JSON.parse(requests[0]!.body!).condition.allOf).to.deep.contain({
      author: { operator: "is", value: { name: "Oda" } },
    });
  });

  suite.test("release date and random sorts map to Komga sorts", async () => {
    expect(resolveSort("releaseDate", "", {})).to.equal("booksMetadata.releaseDate,desc");
    expect(resolveSort("random", "x", {})).to.equal("random");
    const sorts = await getSortingOptions();
    expect(sorts.map((o) => o.id)).to.include.members(["releaseDate", "random"]);
  });

  suite.test("random gives no next page on a full page", async () => {
    const { result, requests } = await captureRequests(seriesJson(40), () =>
      getSearchResults({ title: "" }, undefined, { id: "random", label: "Random" }),
    );
    expect(result.items.length).to.equal(40);
    expect(result.metadata).to.equal(undefined);
    expect(decodeURIComponent(requests[0]!.url)).to.contain("sort=random");
  });

  suite.test("best match with one included collection uses collection order", async () => {
    const one = { collections: { [encodeTagId("collection", "c1")]: "included" as const } };
    expect(resolveSort("bestMatch", "", one)).to.equal("collection.number,asc");
    expect(resolveSort(undefined, "", one)).to.equal("collection.number,asc");
    expect(resolveSort("bestMatch", "naruto", one)).to.equal("relevance");
    expect(resolveSort("titleAsc", "", one)).to.equal("metadata.titleSort,asc");
    const two = {
      collections: {
        [encodeTagId("collection", "c1")]: "included" as const,
        [encodeTagId("collection", "c2")]: "included" as const,
      },
    };
    expect(resolveSort("bestMatch", "", two)).to.equal("metadata.titleSort,asc");
    const excluded = { collections: { [encodeTagId("collection", "c1")]: "excluded" as const } };
    expect(resolveSort("bestMatch", "", excluded)).to.equal("metadata.titleSort,asc");
  });

  suite.test("a publisher tag from the details page searches that publisher", async () => {
    const group = toSourceManga(series).mangaInfo.tagGroups!.find((g) => g.title === "Publisher")!;
    expect(group.id).to.equal("publishers");
    const body = search({ [group.id]: { [group.tags[0]!.id]: "included" } });
    expect(body.condition.allOf).to.deep.equal([
      { anyOf: [{ publisher: { operator: "is", value: "Pub" } }] },
    ]);
  });

  suite.test("getAdvancedSearchForm lists publishers, languages and age ratings", async () => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    app.scheduleRequest = async (request: { url: string }) => {
      const body = request.url.includes("/api/v1/publishers")
        ? '["Shueisha"]'
        : request.url.includes("/api/v1/languages")
          ? '["ja"]'
          : request.url.includes("/api/v1/age-ratings")
            ? '["None","16"]'
            : "[]";
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      const form = await getAdvancedSearchForm({ title: "" });
      const json = JSON.stringify(form.getSections());
      expect(json).to.contain(encodeTagId("publisher", "Shueisha"));
      expect(json).to.contain(encodeTagId("language", "ja"));
      expect(json).to.contain(encodeTagId("ageRating", "None"));
      expect(json).to.contain(encodeTagId("ageRating", "16"));
      expect(json).to.contain(encodeTagId("readStatus", "IN_PROGRESS"));
      expect(json).to.contain(encodeTagId("seriesStatus", "HIATUS"));
      const author = form.getSections().find((s) => s.id === "author_section")!;
      expect(author.items[0]!.id).to.equal("author");
    } finally {
      app.scheduleRequest = original;
    }
  });

  suite.test("the new lookups fall back to empty lists on a 500", async () => {
    const form = await withResponse(500, "", () => getAdvancedSearchForm({ title: "" }));
    const json = JSON.stringify(form.getSections());
    expect(json).to.not.contain("publisher:");
    expect(json).to.not.contain("language:");
    expect(json).to.not.contain("ageRating:");
    expect(form.getSections().length).to.equal(10);
  });

  suite.test("the author row keeps the typed text in the query metadata", async () => {
    const form = new KomgaSearchForm({ title: "", metadata: { author: "Oda" } }, []);
    const row = form.getSections()[0]!.items[0] as unknown as { value: string };
    expect(row.value).to.equal("Oda");
    expect(form.getSearchQueryMetadata()).to.deep.equal({ author: "Oda", filters: {} });
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
      const row = form.getSections().find((s) => s.id === "tags-collections_section")!.items[0] as {
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

  suite.test("search form capitalises genre and tag titles and keeps ids unique", async () => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    app.scheduleRequest = async (request: { url: string }) => {
      const body = request.url.includes("/api/v1/genres")
        ? '["action"]'
        : request.url.includes("/api/v1/tags/series")
          ? '["slice of life"]'
          : "[]";
      return [{ status: 200, headers: {} }, new TextEncoder().encode(body).buffer];
    };
    try {
      const form = await getAdvancedSearchForm({ title: "" });
      const sections = form.getSections();
      const json = JSON.stringify(sections);
      expect(json).to.contain('"title":"Action"');
      expect(json).to.contain('"title":"Slice of life"');
      expect(json).to.contain(encodeTagId("genre", "action"));
      const ids = sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
      expect(new Set(ids).size).to.equal(ids.length);
    } finally {
      app.scheduleRequest = original;
    }
  });

  suite.test("getAdvancedSearchForm tolerates non-array lookups", async () => {
    const form = await withResponse(200, '{"a":1}', () => getAdvancedSearchForm({ title: "" }));
    expect(form.getSections().length).to.equal(10);
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
    const simple = seriesItem(seriesFixture(), "simple");
    expect(simple.type).to.equal("simpleCarouselItem");
    expect(simple.type === "simpleCarouselItem" && simple.subtitle).to.equal(undefined);
  });

  suite.test("getDiscoverSections lists the eight sections and skips hidden ones", async () => {
    expect(DISCOVER_SECTIONS.map((s) => s.id)).to.deep.equal([
      "onDeck",
      "latestChapters",
      "keepReading",
      "nearlyFinished",
      "recentlyAdded",
      "recentlyUpdated",
      "genres",
      "collections",
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

  suite.test("hero book count is singular for one book", async () => {
    const text = (n: number) => {
      const hero = seriesItem(seriesFixture({ booksCount: n }), "hero");
      return hero.type === "featuredCarouselItem" ? hero.infoItems?.[0]?.text : undefined;
    };
    expect(text(1)).to.equal("1 book");
    expect(text(2)).to.equal("2 books");
  });

  suite.test("On Deck hero items carry the info items and use the book symbol", async () => {
    const hero = onDeckItem(bookFixture(), "hero");
    expect(hero.type).to.equal("featuredCarouselItem");
    if (hero.type === "featuredCarouselItem") {
      expect(hero.supertitle).to.equal("Series");
      expect(hero.infoItems).to.deep.equal([{ symbol: "book", text: "30 pages" }]);
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
      expect(requests[0]!.url).to.contain("sort=readDate%2Cdesc");
      expect(JSON.parse(requests[0]!.body!).condition.allOf).to.deep.equal([
        { deleted: { operator: "isFalse" } },
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

  const onDeckSetup = (
    books: BookDto[],
    series: { id: string; genres?: string[]; ageRating?: number }[],
    seriesStatus = 200,
  ) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; body?: string }[] = [];
    const reply = (status: number, data: unknown) => [
      { status, headers: {} },
      new TextEncoder().encode(JSON.stringify(data)).buffer,
    ];
    app.scheduleRequest = async (request: { url: string; body?: string }) => {
      requests.push(request);
      if (request.url.includes("/books/ondeck")) return reply(200, { content: books });
      return reply(seriesStatus, {
        content: series.map((s) => ({
          id: s.id,
          metadata: { genres: s.genres ?? [], ageRating: s.ageRating },
        })),
      });
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
        [
          { id: "bad", genres: ["Hentai"] },
          { id: "ok", genres: ["Action"] },
        ],
      );
      try {
        const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
        expect(result.items.map((i) => "mangaId" in i && i.mangaId)).to.deep.equal(["ok"]);
      } finally {
        setup.restore();
      }
    });
  });

  suite.test(
    "On Deck sets content rating from the series and uses one series request",
    async () => {
      await withSearchState(async () => {
        setHideAdultContent(false);
        const setup = onDeckSetup(
          [bookFixture({ id: "a", seriesId: "adult" }), bookFixture({ id: "b", seriesId: "kids" })],
          [
            { id: "adult", genres: ["Hentai"] },
            { id: "kids", genres: ["Action"] },
          ],
        );
        try {
          const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
          expect(
            result.items.map((i) => ("contentRating" in i ? i.contentRating : undefined)),
          ).to.deep.equal([ContentRating.ADULT, ContentRating.EVERYONE]);
          expect(setup.requests.length).to.equal(2);
          const lookup = setup.requests[1]!;
          expect(lookup.url).to.contain("/api/v1/series/list");
          expect(lookup.url).to.contain("unpaged=true");
          expect(JSON.parse(lookup.body!).condition.anyOf).to.deep.equal([
            { seriesId: { operator: "is", value: "adult" } },
            { seriesId: { operator: "is", value: "kids" } },
          ]);
        } finally {
          setup.restore();
        }
      });
    },
  );

  suite.test("On Deck returns empty items when the series lookup fails", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      const setup = onDeckSetup([bookFixture({ id: "a", seriesId: "x" })], [], 500);
      try {
        const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
        expect(result).to.deep.equal({ items: [] });
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
      let setup = onDeckSetup(books, [{ id: "s1" }]);
      try {
        const result = await getDiscoverSectionItems(sectionFor("onDeck"), undefined);
        expect(result.items.length).to.equal(1);
      } finally {
        setup.restore();
      }
      setIncludeOneshots(true);
      setup = onDeckSetup(books, [{ id: "s1" }]);
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

  const latestSetup = (
    books: BookDto[],
    series: { id: string; title?: string; genres?: string[]; ageRating?: number }[],
  ) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; body?: string }[] = [];
    const reply = (data: unknown) => [
      { status: 200, headers: {} },
      new TextEncoder().encode(JSON.stringify(data)).buffer,
    ];
    app.scheduleRequest = async (request: { url: string; body?: string }) => {
      requests.push(request);
      if (request.url.includes("/books/list")) return reply({ content: books });
      return reply({
        content: series.map((s) => ({
          id: s.id,
          name: s.id,
          metadata: { title: s.title, genres: s.genres ?? [], ageRating: s.ageRating },
        })),
      });
    };
    return {
      requests,
      restore: () => {
        app.scheduleRequest = original;
      },
    };
  };

  const latestBook = (over: Partial<BookDto> = {}): BookDto =>
    bookFixture({
      created: "2026-11-01T10:00:00Z",
      metadata: { title: "Chapter 12: The Fall", number: "12", numberSort: 12 } as never,
      ...over,
    });

  suite.test("Latest Chapters sends a created-desc books/list with scope conditions", async () => {
    await withSearchState(async () => {
      setSelectedLibraries(["lib1"]);
      setIncludeOneshots(false);
      const setup = latestSetup([latestBook()], [{ id: "s1", title: "Series" }]);
      try {
        await getDiscoverSectionItems(sectionFor("latestChapters"), undefined);
        const first = setup.requests[0]!;
        expect(first.url).to.contain("/api/v1/books/list");
        expect(first.url).to.contain("sort=created%2Cdesc");
        expect(first.url).to.contain("size=40");
        expect(first.url).to.contain("page=0");
        expect(JSON.parse(first.body!).condition.allOf).to.deep.equal([
          { deleted: { operator: "isFalse" } },
          { mediaStatus: { operator: "is", value: "READY" } },
          { anyOf: [{ libraryId: { operator: "is", value: "lib1" } }] },
          { oneShot: { operator: "isFalse" } },
        ]);
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("Latest Chapters omits scope conditions when none are set", async () => {
    await withSearchState(async () => {
      setSelectedLibraries([]);
      setIncludeOneshots(true);
      const setup = latestSetup([], []);
      try {
        await getDiscoverSectionItems(sectionFor("latestChapters"), undefined);
        expect(JSON.parse(setup.requests[0]!.body!).condition.allOf).to.deep.equal([
          { deleted: { operator: "isFalse" } },
          { mediaStatus: { operator: "is", value: "READY" } },
        ]);
        expect(setup.requests.length).to.equal(1);
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("Latest Chapters builds chapter update items in two requests", async () => {
    await withSearchState(async () => {
      setHideAdultContent(false);
      const setup = latestSetup([latestBook()], [{ id: "s1", title: "Real Title", ageRating: 18 }]);
      try {
        const result = await getDiscoverSectionItems(sectionFor("latestChapters"), undefined);
        expect(setup.requests.length).to.equal(2);
        expect(result.items.length).to.equal(1);
        const item = result.items[0]!;
        expect(item.type).to.equal("chapterUpdatesCarouselItem");
        if (item.type === "chapterUpdatesCarouselItem") {
          expect(item.mangaId).to.equal("s1");
          expect(item.chapterId).to.equal("b1");
          expect(item.title).to.equal("Real Title");
          expect(item.subtitle).to.equal("The Fall");
          expect(item.imageUrl).to.contain("/api/v1/books/b1/thumbnail");
          expect(item.publishDate?.toISOString()).to.equal("2026-11-01T10:00:00.000Z");
          expect(item.contentRating).to.equal(ContentRating.ADULT);
        }
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("Latest Chapters labels an untitled book by its number", async () => {
    const item = chapterUpdateItem(
      latestBook({ metadata: { title: "Chapter 12", number: "12", numberSort: 12 } as never }),
      seriesFixture(),
    );
    expect(item.subtitle).to.equal("Chapter 12");
  });

  suite.test("Latest Chapters drops books of hidden series", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      const setup = latestSetup(
        [latestBook({ id: "a", seriesId: "bad" }), latestBook({ id: "b", seriesId: "ok" })],
        [
          { id: "bad", genres: ["Hentai"] },
          { id: "ok", genres: ["Action"] },
        ],
      );
      try {
        const result = await getDiscoverSectionItems(sectionFor("latestChapters"), undefined);
        expect(result.items.map((i) => "chapterId" in i && i.chapterId)).to.deep.equal(["b"]);
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("Latest Chapters pages on a full page", async () => {
    await withSearchState(async () => {
      const books = Array.from({ length: 40 }, (_, i) => latestBook({ id: `b${i}` }));
      const setup = latestSetup(books, [{ id: "s1" }]);
      try {
        const result = await getDiscoverSectionItems(sectionFor("latestChapters"), { page: 1 });
        expect(result.metadata).to.deep.equal({ page: 2 });
        expect(setup.requests[0]!.url).to.contain("page=1");
      } finally {
        setup.restore();
      }
    });
  });

  suite.test("Latest Chapters section is a toggle of type chapterUpdates", async () => {
    const saved = getSectionStyle("latestChapters");
    try {
      setSectionStyle("latestChapters", "simple");
      const on = await getDiscoverSections();
      expect(on.map((s) => s.id).slice(0, 2)).to.deep.equal(["onDeck", "latestChapters"]);
      expect(on.find((s) => s.id === "latestChapters")?.type).to.equal(
        DiscoverSectionType.chapterUpdates,
      );
      setSectionStyle("latestChapters", "hidden");
      const off = await getDiscoverSections();
      expect(off.map((s) => s.id)).to.not.include("latestChapters");
      const form = new KomgaHomepageForm() as unknown as SettingsLike;
      expect(rowOf(form, "section_latestChapters").type).to.equal("toggleRow");
    } finally {
      setSectionStyle("latestChapters", saved);
    }
  });

  const readListServer =
    (lists: { id: string; name: string }[], books: Record<string, BookDto[]> = {}) =>
    (request: { url: string }): string => {
      if (request.url.includes("/api/v1/readlists?")) return JSON.stringify({ content: lists });
      const match = /\/api\/v1\/readlists\/([^/]+)\/books/.exec(request.url);
      if (match) {
        if (!books[match[1]!]) throw new Error("Not found");
        return JSON.stringify({ content: books[match[1]!], last: true, number: 0 });
      }
      if (request.url.includes("/api/v1/series/list")) {
        return JSON.stringify({
          content: [
            { id: "s1", name: "S1", metadata: { title: "One", genres: [] } },
            { id: "s2", name: "S2", metadata: { title: "Two", genres: ["Hentai"] } },
          ],
        });
      }
      return "{}";
    };

  const withReadLists = async <T>(enabled: Record<string, boolean>, run: () => Promise<T>) => {
    const ids = ["r1", "r2", "gone"];
    const saved = ids.map((id) => getReadListEnabled(id));
    try {
      ids.forEach((id) => setReadListEnabled(id, enabled[id] ?? false));
      return await run();
    } finally {
      ids.forEach((id, i) => setReadListEnabled(id, saved[i]!));
    }
  };

  suite.test("Collections items search the collection by id", async () => {
    const body = JSON.stringify({ content: [{ id: "c 1", name: "Favourites" }] });
    const { result, requests } = await captureRequests(body, () =>
      getDiscoverSectionItems(sectionFor("collections"), undefined),
    );
    expect(requests[0]!.url).to.contain("/api/v1/collections");
    expect(requests[0]!.url).to.contain("unpaged=true");
    expect(result.items).to.deep.equal([
      {
        type: "genresCarouselItem",
        name: "Favourites",
        searchQuery: {
          title: "",
          metadata: {
            filters: { collections: { [encodeTagId("collection", "c 1")]: "included" } },
          },
        },
      },
    ]);
    const item = result.items[0] as { searchQuery: { title: string; metadata: never } };
    const filters = (item.searchQuery.metadata as { filters: never }).filters;
    expect(resolveSort(undefined, item.searchQuery.title, filters)).to.equal(
      "collection.number,asc",
    );
  });

  suite.test("enabled read lists become sections and disabled ones do not", async () => {
    await withReadLists({ r1: true }, async () => {
      const { result } = await routeRequests(
        readListServer([
          { id: "r1", name: "Summer" },
          { id: "r2", name: "Winter" },
        ]),
        () => getDiscoverSections(),
      );
      const list = result.filter((s) => s.id.startsWith("readList:"));
      expect(list).to.deep.equal([
        { id: "readList:r1", title: "Summer", type: DiscoverSectionType.chapterUpdates },
      ]);
    });
  });

  suite.test("a failed read list fetch leaves the other sections intact", async () => {
    await withReadLists({ r1: true }, async () => {
      const sections = await withResponse(0, new Error("down"), () => getDiscoverSections());
      expect(sections.map((s) => s.id)).to.include("onDeck");
      expect(sections.some((s) => s.id.startsWith("readList:"))).to.equal(false);
    });
  });

  suite.test("a read list deleted on the server disappears and the others still load", async () => {
    await withReadLists({ r1: true, gone: true }, async () => {
      const server = readListServer([{ id: "r1", name: "Summer" }], {
        r1: [bookFixture({ id: "b1", seriesId: "s1" })],
      });
      const { result } = await routeRequests(server, () => getDiscoverSections());
      expect(result.map((s) => s.id)).to.include("readList:r1");
      expect(result.map((s) => s.id)).to.not.include("readList:gone");
      const items = await routeRequests(server, async () => ({
        gone: await getDiscoverSectionItems(sectionFor("readList:gone"), undefined),
        r1: await getDiscoverSectionItems(sectionFor("readList:r1"), undefined),
      }));
      expect(items.result.gone.items).to.deep.equal([]);
      expect(items.result.r1.items.length).to.equal(1);
    });
  });

  suite.test("read list items keep server order, drop hidden series and page on last", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      setIncludeOneshots(true);
      const books = [
        bookFixture({ id: "b3", seriesId: "s1" }),
        bookFixture({ id: "b2", seriesId: "s2" }),
        bookFixture({ id: "b1", seriesId: "s1" }),
      ];
      const { result, requests } = await routeRequests(readListServer([], { r1: books }), () =>
        getDiscoverSectionItems(sectionFor("readList:r1"), { page: 2 }),
      );
      expect(requests[0]!.url).to.contain("/api/v1/readlists/r1/books");
      expect(requests[0]!.url).to.contain("page=2");
      expect(requests[0]!.url).to.contain("size=40");
      expect(result.items.map((i) => "chapterId" in i && i.chapterId)).to.deep.equal(["b3", "b1"]);
      expect(result.metadata).to.equal(undefined);
      const { result: more } = await routeRequests(
        (request) =>
          request.url.includes("/readlists/")
            ? JSON.stringify({ content: [books[0]], last: false, number: 0 })
            : readListServer([], { r1: books })(request),
        () => getDiscoverSectionItems(sectionFor("readList:r1"), { page: 0 }),
      );
      expect(more.items.map((i) => "chapterId" in i && i.chapterId)).to.deep.equal(["b3"]);
      expect(more.metadata).to.deep.equal({ page: 1 });
    });
  });

  suite.test("read list books and the Collections row follow the selected libraries", async () => {
    await withSearchState(async () => {
      const server = readListServer([], { r1: [bookFixture({ id: "b1", seriesId: "s1" })] });
      setSelectedLibraries(["l1", "l2"]);
      const scoped = await routeRequests(server, () =>
        getDiscoverSectionItems(sectionFor("readList:r1"), undefined),
      );
      expect(scoped.requests[0]!.url).to.contain("library_id=l1");
      expect(scoped.requests[0]!.url).to.contain("library_id=l2");
      const cols = await captureRequests('{"content":[]}', () =>
        getDiscoverSectionItems(sectionFor("collections"), undefined),
      );
      expect(cols.requests[0]!.url).to.contain("library_id=l1");
      expect(cols.requests[0]!.url).to.contain("library_id=l2");
      setSelectedLibraries([]);
      const open = await routeRequests(server, () =>
        getDiscoverSectionItems(sectionFor("readList:r1"), undefined),
      );
      expect(open.requests[0]!.url).to.not.contain("library_id");
    });
  });

  suite.test("homepage read list toggles save and invalidate", async () => {
    await withReadLists({}, async () => {
      const { result: form } = await routeRequests(
        readListServer([
          { id: "r1", name: "Summer" },
          { id: "r2", name: "Winter" },
        ]),
        async () => {
          const f = new KomgaHomepageForm() as unknown as SettingsLike;
          await f.formWillAppear!();
          return f;
        },
      );
      expect(rowOf(form, "read_list_1").title).to.equal("Winter");
      const count = await withInvalidateCounter(async () => {
        await (form.handleReadList_1 as (v: boolean) => Promise<void>)(true);
      });
      expect(count).to.equal(1);
      expect(getReadListEnabled("r2")).to.equal(true);
      expect(getReadListEnabled("r1")).to.equal(false);
    });
  });

  suite.test("homepage shows No read lists when there are none or the fetch fails", async () => {
    const empty = new KomgaHomepageForm() as unknown as SettingsLike;
    expect(rowOf(empty, "read_lists_none").title).to.equal("No read lists");
    await withResponse(0, new Error("down"), async () => {
      const failed = new KomgaHomepageForm() as unknown as SettingsLike;
      await failed.formWillAppear!();
      expect(rowOf(failed, "read_lists_none").title).to.equal("No read lists");
    });
  });

  suite.test("resolveBookSeries sends no request for no books", async () => {
    const { result, requests } = await captureRequests("{}", () => resolveBookSeries([]));
    expect(requests.length).to.equal(0);
    expect(result.visible).to.deep.equal([]);
    expect(result.seriesById.size).to.equal(0);
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

  suite.test("Nearly Finished body carries read status, hidden genres and scope", async () => {
    await withSearchState(async () => {
      setHideAdultContent(true);
      setAdultGenres(["Hentai"]);
      setSelectedLibraries(["lib1"]);
      setIncludeOneshots(false);
      const { requests } = await captureRequests(seriesJson(0), () =>
        getDiscoverSectionItems(sectionFor("nearlyFinished"), undefined),
      );
      expect(requests[0]!.url).to.contain("/api/v1/series/list");
      expect(requests[0]!.url).to.contain("unpaged=true");
      expect(JSON.parse(requests[0]!.body!).condition.allOf).to.deep.equal([
        { deleted: { operator: "isFalse" } },
        { readStatus: { operator: "is", value: "IN_PROGRESS" } },
        { genre: { operator: "isNot", value: "hentai" } },
        { anyOf: [{ libraryId: { operator: "is", value: "lib1" } }] },
        { oneShot: { operator: "isFalse" } },
      ]);
    });
  });

  suite.test("Recently Updated filters hidden genres and excludes one-shots", async () => {
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
        getDiscoverSectionItems(sectionFor("recentlyUpdated"), undefined),
      );
      expect(requests[0]!.url).to.contain("/api/v1/series/updated");
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

  suite.test("staffSection merges roles per author and uses the series thumbnail", async () => {
    const section = staffSection({
      ...series,
      booksMetadata: {
        summary: "",
        authors: [
          { name: "W1", role: "writer" },
          { name: "P1", role: "penciller" },
          { name: "W1", role: "inker" },
        ],
      },
    });
    expect(section?.id).to.equal("author");
    expect(section?.title).to.equal("Creators");
    expect(section?.items).to.deep.equal([
      {
        id: "W1",
        staff: { title: "W1", subtitle: "Writer, Inker", imageUrl: seriesThumbnail("s1") },
      },
      { id: "P1", staff: { title: "P1", subtitle: "Penciller", imageUrl: seriesThumbnail("s1") } },
    ]);
  });

  suite.test("staffSection is undefined without authors", async () => {
    expect(staffSection({ ...series, booksMetadata: { summary: "", authors: [] } })).to.equal(
      undefined,
    );
  });

  suite.test("relationSections drops the series itself, caps at 20 and keeps order", async () => {
    const ids = ["s1", ...Array.from({ length: 25 }, (_, i) => `x${i}`)];
    const { result, requests } = await routeRequests(
      (request) => {
        if (request.url.includes("/series/s1/collections")) {
          return JSON.stringify([{ id: "c1", name: "Favourites" }]);
        }
        return JSON.stringify({
          content: ids.map((id) => ({ id, metadata: { title: `T ${id}` } })),
          last: true,
          number: 0,
        });
      },
      () => relationSections("s1"),
    );
    expect(result.length).to.equal(1);
    expect(result[0]!.id).to.equal("collection:c1");
    expect(result[0]!.title).to.equal("In Favourites");
    expect(result[0]!.items.length).to.equal(20);
    expect(result[0]!.items.map((i) => i.id)).to.deep.equal(ids.slice(1, 21));
    expect(result[0]!.items[0]).to.deep.equal({
      id: "x0",
      imageUrl: seriesThumbnail("x0"),
      title: "T x0",
    });
    const list = requests.find((r) => r.url.includes("/series/list"))!;
    expect(list.method).to.equal("POST");
    expect(list.url).to.contain("sort=collection.number%2Casc");
    expect(list.url).to.contain("size=21");
    expect(JSON.parse(list.body ?? "{}")).to.deep.equal({
      condition: { collectionId: { operator: "is", value: "c1" } },
    });
  });

  suite.test("relationSections gives one section per collection", async () => {
    const { result } = await routeRequests(
      (request) => {
        if (request.url.includes("/series/s1/collections")) {
          return JSON.stringify([
            { id: "c1", name: "A" },
            { id: "c2", name: "B" },
          ]);
        }
        return JSON.stringify({ content: [{ id: "x", metadata: { title: "X" } }], last: true });
      },
      () => relationSections("s1"),
    );
    expect(result.map((s) => s.id)).to.deep.equal(["collection:c1", "collection:c2"]);
  });

  suite.test("getMangaDetails keeps staff when the collections lookup fails", async () => {
    const { result } = await routeRequests(
      (request) => {
        if (request.url.includes("/collections")) throw new Error("boom");
        return JSON.stringify(series);
      },
      () => getMangaDetails("s1"),
    );
    expect(result.mangaInfo.extras?.map((e) => e.id)).to.deep.equal(["author"]);
  });

  suite.test("getMangaDetails adds one relation section per collection", async () => {
    const { result } = await routeRequests(
      (request) => {
        if (request.url.includes("/series/s1/collections")) {
          return JSON.stringify([{ id: "c1", name: "A" }]);
        }
        if (request.url.includes("/series/list")) {
          return JSON.stringify({ content: [{ id: "x", metadata: { title: "X" } }], last: true });
        }
        return JSON.stringify(series);
      },
      () => getMangaDetails("s1"),
    );
    expect(result.mangaInfo.extras?.map((e) => e.id)).to.deep.equal(["author", "collection:c1"]);
  });

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

  suite.test("progress form Mark Read with no chapters says all chapters read", async () => {
    const form = (await routeRequests(
      () => JSON.stringify({ content: [], last: true, number: 0 }),
      () => getMangaProgressManagementForm(sourceManga),
    ).then((r) => r.result)) as unknown as {
      handleMarkRead(): Promise<void>;
      getSections(): unknown[];
    };
    await withResponse(200, "", () => form.handleMarkRead());
    const text = JSON.stringify(form.getSections());
    expect(text).to.contain('"title":"Current progress","value":"All chapters read"');
  });

  suite.test("progress form Mark Unread shows a thrown string, not undefined", async () => {
    const form = (await routeRequests(progressServer(2), () =>
      getMangaProgressManagementForm(sourceManga),
    ).then((r) => r.result)) as unknown as {
      handleMarkUnread(): Promise<void>;
      getSections(): unknown[];
    };
    // komgaFetch wraps transport failures in an Error, so a raw string is checked on the helper.
    expect(errorMessage("boom")).to.equal("boom");
    expect(errorMessage(new Error("bad"))).to.equal("bad");
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    app.scheduleRequest = async () => {
      throw "boom";
    };
    try {
      await form.handleMarkUnread();
    } finally {
      app.scheduleRequest = original;
    }
    const text = JSON.stringify(form.getSections());
    expect(text).to.contain("Could not mark unread: ");
    expect(text).to.not.contain("undefined");
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

  type SettingsLike = {
    getSections(): { id: string; footer?: string; items: Record<string, unknown>[] }[];
    formWillAppear?(): Promise<void>;
    formDidSubmit?(): Promise<void>;
    [handler: string]: unknown;
  };

  const settingsServer = (request: { url: string }): string => {
    if (request.url.includes("/users/me")) return '{"email":"a@b.c"}';
    if (request.url.includes("/genres")) return '["Action","Ecchi"]';
    if (request.url.includes("/libraries")) return '[{"id":"l1","name":"Manga"}]';
    return "{}";
  };

  const rowsOf = (form: SettingsLike) => form.getSections().flatMap((s) => s.items);
  const rowIdsOf = (form: SettingsLike) => rowsOf(form).map((r) => r.id as string);
  const rowOf = (form: SettingsLike, id: string) => rowsOf(form).find((r) => r.id === id)!;

  // A SelectRow is a navigation row whose form holds the real props.
  const selectParams = (form: SettingsLike, id: string) =>
    (rowOf(form, id).form as { params: unknown }).params;

  const withInvalidateCounter = async (run: () => Promise<void>): Promise<number> => {
    const app = Application as unknown as { invalidateDiscoverSections: () => void };
    const original = app.invalidateDiscoverSections;
    let count = 0;
    app.invalidateDiscoverSections = () => {
      count++;
    };
    try {
      await run();
    } finally {
      app.invalidateDiscoverSections = original;
    }
    return count;
  };

  suite.test("settings forms use unique row ids and a secure password row", async () => {
    await routeRequests(settingsServer, async () => {
      const root = (await getSettingsForm()) as unknown as SettingsLike;
      await root.formWillAppear!();
      const server = new KomgaServerForm() as unknown as SettingsLike;
      const homepage = new KomgaHomepageForm() as unknown as SettingsLike;
      const content = new KomgaContentForm() as unknown as SettingsLike;
      await content.formWillAppear!();
      const ids = [root, server, homepage, content].flatMap(rowIdsOf);
      expect(new Set(ids).size).to.equal(ids.length);
      const sectionIds = [root, server, homepage, content].flatMap((f) =>
        f.getSections().map((s) => s.id),
      );
      expect(new Set(sectionIds).size).to.equal(sectionIds.length);
      expect(rowOf(server, "password").isSecureEntry).to.equal(true);
    });
  });

  suite.test("root status reads Checking until the screen appears", async () => {
    await routeRequests(settingsServer, async () => {
      const root = new KomgaSettingsForm() as unknown as SettingsLike;
      expect(rowOf(root, "status").value).to.equal("Checking…");
      await root.formWillAppear!();
      expect(rowOf(root, "status").value).to.equal("Connected as a@b.c");
    });
    const failed = new KomgaSettingsForm() as unknown as SettingsLike;
    await withResponse(401, "", () => failed.formWillAppear!());
    expect(rowOf(failed, "status").value).to.equal("Invalid credentials");
  });

  suite.test("server form tests the typed values without saving them", async () => {
    const before = { url: getBaseUrl(), creds: getCredentials() };
    const server = new KomgaServerForm() as unknown as SettingsLike;
    const { requests } = await routeRequests(settingsServer, async () => {
      await (server.handleBaseUrl as (v: string) => Promise<void>)("https://typed.example/");
      await (server.handleUsername as (v: string) => Promise<void>)("typed-user");
      await (server.handlePassword as (v: string) => Promise<void>)("typed-pass");
      await (server.handleTestConnection as () => Promise<void>)();
    });
    expect(requests[0]!.url).to.contain("https://typed.example/api/v2/users/me");
    const headers = (requests[0] as unknown as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).to.equal(basicAuthHeader("typed-user", "typed-pass"));
    expect(server.getSections().some((s) => s.footer === "Connected as a@b.c")).to.equal(true);
    expect(getBaseUrl()).to.equal(before.url);
    expect(getCredentials()).to.deep.equal(before.creds);
  });

  suite.test(
    "server form has an API key row and disables login rows while it is typed",
    async () => {
      const server = new KomgaServerForm() as unknown as SettingsLike;
      expect(rowOf(server, "api_key").isSecureEntry).to.equal(true);
      expect(rowOf(server, "username").isDisabled).to.equal(false);
      await (server.handleApiKey as (v: string) => Promise<void>)("typed-key");
      expect(rowOf(server, "username").isDisabled).to.equal(true);
      expect(rowOf(server, "password").isDisabled).to.equal(true);
      expect(
        server
          .getSections()
          .some(
            (s) =>
              s.footer ===
              "API keys need Komga 1.20 or later. Create one in Komga under Account settings.",
          ),
      ).to.equal(true);
    },
  );

  suite.test("server form Test Connection sends X-API-Key with the typed key", async () => {
    const server = new KomgaServerForm() as unknown as SettingsLike;
    const { requests } = await routeRequests(settingsServer, async () => {
      await (server.handleBaseUrl as (v: string) => Promise<void>)("https://typed.example/");
      await (server.handleApiKey as (v: string) => Promise<void>)("typed-key");
      await (server.handleTestConnection as () => Promise<void>)();
    });
    const headers = (requests[0] as unknown as { headers: Record<string, string> }).headers;
    expect(headers["X-API-Key"]).to.equal("typed-key");
    expect(headers["Authorization"]).to.equal(undefined);
  });

  suite.test("server form submit saves the API key", async () => {
    const before = { url: getBaseUrl(), creds: getCredentials(), key: getApiKey() };
    try {
      const server = new KomgaServerForm() as unknown as SettingsLike;
      await (server.handleBaseUrl as (v: string) => Promise<void>)("https://typed.example/");
      await (server.handleApiKey as (v: string) => Promise<void>)(" saved-key ");
      await routeRequests(settingsServer, () => server.formDidSubmit!());
      expect(getApiKey()).to.equal("saved-key");
    } finally {
      setBaseUrl(before.url);
      setCredentials(before.creds.username, before.creds.password);
      setApiKey(before.key);
    }
  });

  suite.test("server form submit throws the check message and saves only on success", async () => {
    const before = { url: getBaseUrl(), creds: getCredentials() };
    try {
      const server = new KomgaServerForm() as unknown as SettingsLike;
      await (server.handleBaseUrl as (v: string) => Promise<void>)("https://typed.example/");
      await (server.handleUsername as (v: string) => Promise<void>)("typed-user");
      await (server.handlePassword as (v: string) => Promise<void>)("typed-pass");
      expect(server.requiresExplicitSubmission).to.equal(true);
      let message = "";
      try {
        await withResponse(401, "", () => server.formDidSubmit!());
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).to.equal("Invalid credentials");
      expect(getBaseUrl()).to.equal(before.url);
      const failedCount = await withInvalidateCounter(async () => {
        await withResponse(401, "", () => server.formDidSubmit!()).catch(() => undefined);
      });
      expect(failedCount).to.equal(0);
      const okCount = await withInvalidateCounter(async () => {
        await routeRequests(settingsServer, () => server.formDidSubmit!());
      });
      expect(okCount).to.equal(1);
      expect(getBaseUrl()).to.equal("https://typed.example");
      expect(getCredentials()).to.deep.equal({ username: "typed-user", password: "typed-pass" });
    } finally {
      setBaseUrl(before.url);
      setCredentials(before.creds.username, before.creds.password);
    }
  });

  suite.test("homepage changes save the style and invalidate discover sections", async () => {
    const saved = getSectionStyle("onDeck");
    const savedGenres = getSectionStyle("genres");
    try {
      const form = new KomgaHomepageForm() as unknown as SettingsLike;
      expect(rowOf(form, "section_genres").type).to.equal("toggleRow");
      const count = await withInvalidateCounter(async () => {
        await (form.handleSectionStyle_onDeck as (v: string[]) => Promise<void>)(["hero"]);
        await (form.handleSectionStyle_genres as (v: boolean) => Promise<void>)(false);
      });
      expect(count).to.equal(2);
      expect(getSectionStyle("onDeck")).to.equal("hero");
      expect(getSectionStyle("genres")).to.equal("hidden");
    } finally {
      setSectionStyle("onDeck", saved);
      setSectionStyle("genres", savedGenres);
    }
  });

  suite.test("content form lists server genres and libraries and saves changes", async () => {
    await withSearchState(async () => {
      setAdultGenres(["gore"]);
      const form = new KomgaContentForm() as unknown as SettingsLike;
      await routeRequests(settingsServer, () => form.formWillAppear!());
      const genreRow = selectParams(form, "adult_genres") as {
        items: { id: string }[];
        value: string[];
      };
      expect(genreRow.items.map((i) => i.id)).to.have.members([
        encodeTagId("genre", "action"),
        encodeTagId("genre", "ecchi"),
        encodeTagId("genre", "gore"),
      ]);
      expect(genreRow.value).to.deep.equal([encodeTagId("genre", "gore")]);
      const libraryRow = selectParams(form, "libraries") as { items: { id: string }[] };
      expect(libraryRow.items.map((i) => i.id)).to.deep.equal(["l1"]);
      const count = await withInvalidateCounter(async () => {
        await (form.handleHideAdult as (v: boolean) => Promise<void>)(true);
        await (form.handleAdultGenres as (v: string[]) => Promise<void>)([
          encodeTagId("genre", "ecchi"),
        ]);
        await (form.handleLibraries as (v: string[]) => Promise<void>)(["l1"]);
        await (form.handleIncludeOneshots as (v: boolean) => Promise<void>)(false);
      });
      expect(count).to.equal(4);
      expect(getHideAdultContent()).to.equal(true);
      expect(getAdultGenres()).to.deep.equal(["ecchi"]);
      expect(getSelectedLibraries()).to.deep.equal(["l1"]);
      expect(getIncludeOneshots()).to.equal(false);
    });
  });

  suite.test("content form still opens when genres and libraries fail to load", async () => {
    await withSearchState(async () => {
      setAdultGenres([]);
      const form = new KomgaContentForm() as unknown as SettingsLike;
      await withResponse(500, "", () => form.formWillAppear!());
      expect((selectParams(form, "adult_genres") as { items: unknown[] }).items).to.deep.equal([]);
      expect((selectParams(form, "libraries") as { items: unknown[] }).items).to.deep.equal([]);
    });
  });

  suite.test("checkConnection requests a clean URL for a trailing-slash base", async () => {
    const { requests } = await routeRequests(settingsServer, () =>
      checkConnection("https://x.example/", { username: "u", password: "p" }),
    );
    expect(requests[0]!.url).to.equal("https://x.example/api/v2/users/me");
  });

  suite.test("komgaFetch strips every trailing slash from the base", async () => {
    const { requests } = await routeRequests(
      () => "{}",
      () => komgaFetch("/api/v1/x", { baseUrl: "https://x.example//" }),
    );
    expect(requests[0]!.url).to.equal("https://x.example/api/v1/x");
  });

  type CollectionState = { seriesIds: string[]; filtered?: boolean };
  const collectionServer = async (
    admin: boolean | "error",
    collections: Record<string, CollectionState>,
    patchStatus: Record<string, number> = {},
    run: () => Promise<unknown>,
  ) => {
    const app = Application as unknown as { scheduleRequest: unknown };
    const original = app.scheduleRequest;
    const requests: { url: string; method?: string; body?: string }[] = [];
    app.scheduleRequest = async (request: { url: string; method?: string; body?: string }) => {
      requests.push(request);
      let status = 200;
      let body: unknown = {};
      const match = /\/api\/v1\/collections\/([^/?]+)$/.exec(request.url);
      if (request.url.endsWith("/api/v2/users/me")) {
        if (admin === "error") status = 500;
        body = { roles: admin === true ? ["ADMIN", "USER"] : ["USER"] };
      } else if (match) {
        if (request.method === "PATCH") status = patchStatus[match[1]!] ?? 200;
        else body = { id: match[1], name: match[1], filtered: false, ...collections[match[1]!] };
      }
      return [{ status, headers: {} }, new TextEncoder().encode(JSON.stringify(body)).buffer];
    };
    let thrown: Error | undefined;
    let result: unknown;
    try {
      result = await run();
    } catch (error) {
      thrown = error as Error;
    } finally {
      app.scheduleRequest = original;
    }
    return { requests, thrown, result };
  };

  const col = (id: string): { id: string; title: string } => ({ id, title: id });
  const manga = (id: string) => ({ mangaId: id }) as SourceManga;
  const patches = (requests: { url: string; method?: string; body?: string }[]) =>
    requests
      .filter((r) => r.method === "PATCH")
      .map((r) => ({ url: r.url.split("/api/v1/collections/")[1], body: JSON.parse(r.body!) }));

  suite.test(
    "collection changes: a non-admin account fails every change and sends no PATCH",
    async () => {
      const { requests, thrown } = await collectionServer(
        false,
        { c1: { seriesIds: ["a", "b"] } },
        {},
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
            { id: "2", type: "remove", from: col("c1"), sourceManga: manga("a") },
          ]),
      );
      expect(thrown?.message).to.contain("Changing Komga collections needs an admin account");
      expect(patches(requests)).to.deep.equal([]);
      expect(requests.length).to.equal(1);
    },
  );

  suite.test("collection changes: add and remove on one collection send one PATCH", async () => {
    const { requests, thrown, result } = await collectionServer(
      true,
      { c1: { seriesIds: ["a", "b"] } },
      {},
      () =>
        applyManagedCollectionChanges([
          { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
          { id: "2", type: "remove", from: col("c1"), sourceManga: manga("a") },
        ]),
    );
    expect(thrown).to.equal(undefined);
    expect(result).to.deep.equal([]);
    expect(
      requests.filter((r) => r.url.endsWith("collections/c1") && r.method !== "PATCH").length,
    ).to.equal(1);
    expect(patches(requests)).to.deep.equal([{ url: "c1", body: { seriesIds: ["b", "x"] } }]);
  });

  suite.test("collection changes: a move patches both collections", async () => {
    const { requests, result } = await collectionServer(
      true,
      { c1: { seriesIds: ["a", "b"] }, c2: { seriesIds: ["z"] } },
      {},
      () =>
        applyManagedCollectionChanges([
          { id: "1", type: "move", from: col("c1"), to: col("c2"), sourceManga: manga("a") },
        ]),
    );
    expect(result).to.deep.equal([]);
    expect(patches(requests)).to.deep.equal([
      { url: "c2", body: { seriesIds: ["z", "a"] } },
      { url: "c1", body: { seriesIds: ["b"] } },
    ]);
  });

  suite.test(
    "collection changes: a move into a filtered collection leaves the source alone",
    async () => {
      const { requests, thrown, result } = await collectionServer(
        true,
        { c1: { seriesIds: ["a", "b"] }, c2: { seriesIds: ["z"], filtered: true } },
        {},
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "move", from: col("c1"), to: col("c2"), sourceManga: manga("a") },
            { id: "2", type: "add", to: col("c1"), sourceManga: manga("q") },
          ]),
      );
      expect(thrown).to.equal(undefined);
      expect(result).to.deep.equal([
        { changeId: "1", reason: "This collection has series your account can't see" },
      ]);
      expect(patches(requests)).to.deep.equal([
        { url: "c1", body: { seriesIds: ["a", "b", "q"] } },
      ]);
    },
  );

  suite.test(
    "collection changes: a move whose add PATCH fails sends no PATCH to the source",
    async () => {
      const { requests, thrown, result } = await collectionServer(
        true,
        { c1: { seriesIds: ["a", "b"] }, c2: { seriesIds: ["z"] } },
        { c2: 500 },
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "move", from: col("c1"), to: col("c2"), sourceManga: manga("a") },
            { id: "2", type: "add", to: col("c1"), sourceManga: manga("q") },
          ]),
      );
      expect(thrown).to.equal(undefined);
      expect(result).to.deep.equal([{ changeId: "1", reason: "Komga returned 500" }]);
      expect(patches(requests).map((p) => p.url)).to.deep.equal(["c2", "c1"]);
      expect(patches(requests)[1]!.body).to.deep.equal({ seriesIds: ["a", "b", "q"] });
    },
  );

  suite.test("collection changes: a move onto its own collection is a no-op", async () => {
    const { requests, thrown, result } = await collectionServer(
      true,
      { c1: { seriesIds: ["a", "b"] }, c2: { seriesIds: ["z"], filtered: true } },
      {},
      () =>
        applyManagedCollectionChanges([
          { id: "1", type: "move", from: col("c1"), to: col("c1"), sourceManga: manga("a") },
          { id: "2", type: "add", to: col("c2"), sourceManga: manga("q") },
        ]),
    );
    expect(thrown).to.equal(undefined);
    expect(result.length).to.equal(1);
    expect(patches(requests)).to.deep.equal([]);
  });

  suite.test("collection changes: a failing /users/me throws with nothing written", async () => {
    const { requests, thrown } = await collectionServer(
      "error",
      { c1: { seriesIds: ["a", "b"] } },
      {},
      () =>
        applyManagedCollectionChanges([
          { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
        ]),
    );
    expect(thrown?.message).to.contain("Komga returned 500");
    expect(requests.length).to.equal(1);
  });

  suite.test("collection changes: adding a series already there sends no PATCH", async () => {
    const { requests, thrown, result } = await collectionServer(
      true,
      { c1: { seriesIds: ["a", "b"] } },
      {},
      () =>
        applyManagedCollectionChanges([
          { id: "1", type: "add", to: col("c1"), sourceManga: manga("a") },
        ]),
    );
    expect(thrown).to.equal(undefined);
    expect(result).to.deep.equal([]);
    expect(patches(requests)).to.deep.equal([]);
  });

  suite.test(
    "collection changes: a malformed collection fails its edits without throwing",
    async () => {
      const { requests, thrown, result } = await collectionServer(
        true,
        { c1: {} as CollectionState, c2: { seriesIds: ["z"] } },
        {},
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
            { id: "2", type: "add", to: col("c2"), sourceManga: manga("y") },
          ]),
      );
      expect(thrown).to.equal(undefined);
      expect(result).to.deep.equal([
        { changeId: "1", reason: "Komga returned an unexpected collection" },
      ]);
      expect(patches(requests).map((p) => p.url)).to.deep.equal(["c2"]);
    },
  );

  suite.test(
    "collection changes: no-ops and failures together return only the failures",
    async () => {
      const { requests, thrown, result } = await collectionServer(
        true,
        { c1: { seriesIds: ["a", "b"] }, c2: { seriesIds: ["z"], filtered: true } },
        {},
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "add", to: col("c1"), sourceManga: manga("a") },
            { id: "2", type: "remove", from: col("c1"), sourceManga: manga("nope") },
            { id: "3", type: "add", to: col("c2"), sourceManga: manga("q") },
          ]),
      );
      expect(thrown).to.equal(undefined);
      expect(result.map((f) => f.changeId)).to.deep.equal(["3"]);
      expect(patches(requests)).to.deep.equal([]);
    },
  );

  suite.test("collection reads ask for unpaged lists", async () => {
    const reads = await routeRequests(
      () => JSON.stringify({ content: [] }),
      async () => {
        await getManagedCollections();
        await getManagedCollectionItems([col("c1")]);
      },
    );
    expect(reads.requests.length).to.equal(2);
    for (const request of reads.requests) expect(request.url).to.contain("unpaged=true");
  });

  suite.test("collection changes: emptying a collection fails but the rest apply", async () => {
    const { requests, thrown, result } = await collectionServer(
      true,
      { c1: { seriesIds: ["a"] }, c2: { seriesIds: ["z"] } },
      {},
      () =>
        applyManagedCollectionChanges([
          { id: "1", type: "remove", from: col("c1"), sourceManga: manga("a") },
          { id: "2", type: "add", to: col("c2"), sourceManga: manga("y") },
        ]),
    );
    expect(thrown).to.equal(undefined);
    expect(result).to.deep.equal([{ changeId: "1", reason: "Komga collections can't be empty" }]);
    expect(patches(requests)).to.deep.equal([{ url: "c2", body: { seriesIds: ["z", "y"] } }]);
  });

  suite.test(
    "collection changes: a filtered collection fails every change and sends no PATCH",
    async () => {
      const { requests, thrown, result } = await collectionServer(
        true,
        { c1: { seriesIds: ["a", "b"], filtered: true }, c2: { seriesIds: ["z"] } },
        {},
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
            { id: "2", type: "remove", from: col("c1"), sourceManga: manga("a") },
            { id: "3", type: "add", to: col("c2"), sourceManga: manga("y") },
          ]),
      );
      expect(thrown).to.equal(undefined);
      const reason = "This collection has series your account can't see";
      expect(result).to.deep.equal([
        { changeId: "1", reason },
        { changeId: "2", reason },
      ]);
      expect(patches(requests).map((p) => p.url)).to.deep.equal(["c2"]);
    },
  );

  suite.test(
    "collection changes: a PATCH error fails its changes, and throws only if all failed",
    async () => {
      const some = await collectionServer(
        true,
        { c1: { seriesIds: ["a"] }, c2: { seriesIds: ["z"] } },
        { c1: 500 },
        () =>
          applyManagedCollectionChanges([
            { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
            { id: "2", type: "add", to: col("c2"), sourceManga: manga("y") },
          ]),
      );
      expect(some.thrown).to.equal(undefined);
      expect(some.result).to.deep.equal([{ changeId: "1", reason: "Komga returned 500" }]);
      const all = await collectionServer(true, { c1: { seriesIds: ["a"] } }, { c1: 500 }, () =>
        applyManagedCollectionChanges([
          { id: "1", type: "add", to: col("c1"), sourceManga: manga("x") },
        ]),
      );
      expect(all.thrown?.message).to.contain("Komga returned 500");
    },
  );

  suite.test("getManagedCollections maps names and returns [] on error", async () => {
    const ok = await withResponse(
      200,
      JSON.stringify({ content: [{ id: "c1", name: "Faves" }], last: true, number: 0 }),
      () => getManagedCollections(),
    );
    expect(ok).to.deep.equal([{ id: "c1", title: "Faves" }]);
    expect(await withResponse(500, "", () => getManagedCollections())).to.deep.equal([]);
  });

  suite.test(
    "getManagedCollectionItems maps series and gives [] for a failed collection",
    async () => {
      const { result } = await routeRequests(
        () =>
          JSON.stringify({
            content: [seriesFixture({ id: "s1", booksMetadata: { authors: [], summary: "" } })],
          }),
        () => getManagedCollectionItems([col("c1")]),
      );
      expect(result[0]!.collectionId).to.equal("c1");
      expect(result[0]!.items.map((m) => m.mangaId)).to.deep.equal(["s1"]);
      const failed = await withResponse(500, "", () => getManagedCollectionItems([col("c1")]));
      expect(failed).to.deep.equal([{ collectionId: "c1", items: [] }]);
    },
  );

  suite.test("the extension advertises and implements managed collections", async () => {
    expect(sourceInfo.capabilities).to.include(SourceIntents.MANAGED_COLLECTION_PROVIDING);
    expect(Komga.applyManagedCollectionChanges).to.equal(applyManagedCollectionChanges);
  });

  await suite.run();
}
