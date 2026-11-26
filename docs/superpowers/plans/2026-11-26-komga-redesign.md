# Komga Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Komga extension for Paperback 0.9 in `src/Komga`, in Inkdex's layout, matching every behaviour in the design doc.

**Architecture:** A short `main.ts` wires one folder per capability under `implementations/`. A hand-written client in `services/network.ts` handles Basic auth and JSON. Pure logic (title parsing, content rating, search conditions, update priorities, progress lookup, connection result) lives in `implementations/shared/` so the test suite can check it without a server.

**Tech Stack:** TypeScript 7, `@paperback/types` and `@paperback/toolchain` `^1.0.0-alpha.92`, oxlint, oxfmt, `paperback-cli test` with chai `expect`.

**Spec:** `docs/superpowers/specs/2026-11-26-komga-redesign-design.md`. Read it before any task. Its Behaviour section is the contract.

**Reference only (never copy files):** old code at `/tmp/komga-old/src/Komga` (re-clone with `git clone -b 0.9 https://git.dcunha.io/Exikle/extensions-default.git /tmp/komga-old` if missing). Inkdex patterns: `gh api "repos/inkdex/general-extensions/contents/src/MangaDex/<path>?ref=0.9/stable" -H "Accept: application/vnd.github.raw"`. The best models are `main.ts`, `services/network.ts` and `implementations/search-results/forms.ts`.

## Global Constraints

- Work only in `/home/exikle/selfhosted-extensions/.worktrees/feat-komga`, branch `feat/komga`.
- Each commit message is one line, with no body and no attribution. Stage files by name; never `git add .` or `-A`. Run `git diff --staged` before each commit. Never `--no-verify`.
- Every `.ts` file under `src/Komga` starts with:
  ```ts
  /* SPDX-License-Identifier: GPL-3.0-or-later */
  /* Copyright © 2026 Exikle */
  ```
- Source id is the folder `src/Komga`. `pbconfig.ts`: version `4.0.0`, name `Komga`, `contentRating: ContentRating.EVERYONE`, badge `{label: "Self hosted", backgroundColor: "#000000", textColor: "#ffffff"}`. Developers: Faizan Durrani (`FaizanDurrani`), Lemon (`FramboisePi`), Exikle (`Exikle`).
- Capabilities: `CHAPTER_PROVIDING`, `SEARCH_RESULT_PROVIDING`, `SETTINGS_FORM_PROVIDING`, `DISCOVER_SECTION_PROVIDING`, `PROGRESS_PROVIDING`.
- No imports from `@paperback/types/lib/compat/0.8`. No generated SDK.
- Setting keys exactly: `serverURL`, `serverUsername` (secure), `serverPassword` (secure), `hideAdultContent`, `adultGenres`, `sectionStyle.<sectionId>`, `selectedLibraries`, `includeOneshots`.
- Page size 40 everywhere it pages.
- Canadian spelling in UI text and docs.
- `npm run conformance` passes at the end of every task.

## Review Focus

1. **Server off or unreachable while the user searches another source.** `getSearchResults` must return `{items: []}`, not throw. Test in Task 8.
2. **Base URL typed with a trailing slash or a path that serves Komga's SPA.** Requests must not have `//api`, and the status must read "That URL is not a Komga API endpoint". Tests in Tasks 2 and 5.
3. **Genre or tag names with non-Latin characters (`日本語`, `Ação`).** Ids must round-trip and never throw. Test in Task 2.
4. **More than 2,000 recently changed series** (the update check hits its 50-page cap). Unseen series keep their default priority instead of `skip`. Test in Task 7.
5. **A chapter with no title, or a title that is only the chapter number.** The progress label and picker show `Chapter <n>`. Tests in Tasks 3 and 10.

---

### Task 1: Scaffold `src/Komga` and clean up the template

**Files:**

- Create: `src/Komga/pbconfig.ts`, `src/Komga/main.ts`, `src/Komga/static/icon.png` (copy from `/tmp/komga-old/src/Komga/static/icon.png`), `src/tests/Komga.ts`
- Delete: `src/ContentTemplate/` (all), `src/tests/ContentTemplate.ts`, `.github/workflows/bundle-deploy.yaml`, `.github/workflows/registry-management.yaml`, `.github/workflows/delete-branch-ext.yaml`, `.github/dependabot.yml`
- Modify: `README.md` (one paragraph: what this repo is, how to run `npm run dev` and add the LAN URL in Paperback), `package.json` (`"name": "Self-hosted Extensions (0.9)"` stays; add `chai` and `@types/chai` to devDependencies only if `npm run test` fails to resolve `chai`)

**Interfaces:**

- Produces: `export class KomgaExtension implements ExtensionImpl<typeof KomgaConfig>` and `export const Komga = new KomgaExtension()` in `src/Komga/main.ts`. Later tasks add methods by assignment (`getMangaDetails = getMangaDetails;`), as Inkdex MangaDex does.
- Produces: `src/tests/Komga.ts` exporting `async function runTests(logger: TestLogger)`. It builds `new TestSuite("Komga tests", logger)`, calls `registerDefaultTests(suite, Komga, sourceInfo)`, then the unit tests added by later tasks, then `await suite.run()`.

- [ ] **Step 1:** Run `npm ci` in the worktree. Expected: exit 0.
- [ ] **Step 2:** Create the files above. `main.ts` has only `initialise()` (empty for now) and the export. Then delete the files listed.
- [ ] **Step 3:** Check `.github/workflows/conformance.yaml` and `test.yaml`. If either uses GitHub-only actions or secrets that the Forgejo runner lacks (check the `runs-on` label against `fjo` or the Forgejo MCP `list_action_runners_jobs`), delete it. Otherwise keep it.
- [ ] **Step 4:** Run `npm run conformance`. Expected: exit 0. Run `npm run bundle`. Expected: `bundles/` contains `Komga`.
- [ ] **Step 5:** Commit: `chore: scaffold the komga extension and drop the template example`

### Task 2: Settings state and id helpers

**Files:**

- Create: `src/Komga/implementations/shared/state.ts`, `src/Komga/implementations/shared/utils.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Produces, in `state.ts`:
  - `getBaseUrl(): string`, `setBaseUrl(url: string): void`. Both pass the value through `normaliseBaseUrl`. Default `https://demo.komga.org`.
  - `getCredentials(): {username: string; password: string}` and `setCredentials(username: string, password: string): void`. Secure state. Defaults are the Komga demo login from `/tmp/komga-old/src/Komga/utils/config.ts:10-11`.
  - `getHideAdultContent(): boolean` (default `false`), `setHideAdultContent(v: boolean)`.
  - `getAdultGenres(): string[]`, lower-cased. Default `["adult","hentai","smut","erotica","pornographic","mature","ecchi"]`. `setAdultGenres(v: string[])`.
  - `type SectionStyle = "hidden" | "simple" | "large" | "hero"`. `getSectionStyle(id: string): SectionStyle` (default `"simple"`; an unknown stored value also gives `"simple"`). `setSectionStyle(id: string, style: SectionStyle)`.
  - `getSelectedLibraries(): string[]` (default `[]`), `setSelectedLibraries(v: string[])`.
  - `getIncludeOneshots(): boolean` (default `true`), `setIncludeOneshots(v: boolean)`.
- Produces, in `utils.ts`:
  - `normaliseBaseUrl(url: string): string`: trims, then removes trailing `/`.
  - `encodeTagId(kind: "genre" | "tag" | "library" | "collection", value: string): string` gives `` `${kind}:${encodeURIComponent(value)}` ``.
  - `decodeTagId(id: string): {kind: string; value: string} | undefined`: splits on the first `:`, then runs `decodeURIComponent`. Returns `undefined` on a malformed id; never throws.
  - `capitalise(s: string): string`.

- [ ] **Step 1: Write failing tests** in `src/tests/Komga.ts`, using `suite.test(name, async () => …)` and chai `expect`:
  - `normaliseBaseUrl`: `" https://k.example/ "` gives `"https://k.example"`; `"https://k.example//"` gives `"https://k.example"`.
  - Tag ids round-trip: `decodeTagId(encodeTagId("genre", "日本語"))` deep-equals `{kind: "genre", value: "日本語"}`. Same for `"Ação"`, `"Science Fiction"` and `"a:b"`.
  - `decodeTagId("genre:%E0%A4%A")` is `undefined`.
- [ ] **Step 2:** Run `npm run test`. Expected: the new tests fail (missing module).
- [ ] **Step 3:** Implement both files to the signatures above.
- [ ] **Step 4:** Run `npm run test`. Expected: the new tests pass. Run `npm run conformance`. Expected: exit 0.
- [ ] **Step 5:** Commit: `feat(komga): settings state and tag id helpers`

### Task 3: Chapter title parser

**Files:**

- Create: `src/Komga/implementations/shared/titles.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Produces: `parseChapterTitle(raw: string, number: number): {title?: string; volume?: number}` and `chapterLabel(chapter: {title?: string; chapNum: number}): string`, which returns `title` if it is not empty, else `` `Chapter ${chapNum}` ``.

- [ ] **Step 1: Write failing tests.** One assertion per row of the spec's "Title parser" table, with `title` and `volume` checked separately (`undefined` where the table says "none"). Add `chapterLabel({title: "", chapNum: 12})` gives `"Chapter 12"`.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement. Loop while any token matches at the start: volume `/^vol(?:ume)?\.?\s*(\d+(?:\.\d+)*|TBD|TBA|N\/A|NA|\?{1,3})(?![A-Za-z])\s*/i`, keeping the first numeric volume; chapter `/^ch(?:apter)?\.?\s*-?\d+(?:\.\d+)*\s*/i`; separator `/^[-–—:|]\s*/`. Trim the rest. Drop it when it is only a number equal to `number`. Empty means `title` is `undefined`. The table's `Vol. THE Beginning` and `VOLCANO` rows pin that nothing else is a placeholder.
- [ ] **Step 4:** Run `npm run test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(komga): chapter title parser`

### Task 4: Content rating

**Files:**

- Create: `src/Komga/implementations/shared/content-rating.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Produces: `ADULT_GENRES = ["adult","hentai","smut","erotica","pornographic"]`, `MATURE_GENRES = ["mature","ecchi"]`, and `parseContentRating(meta: {ageRating?: number | null; genres?: string[]}): ContentRating`.

- [ ] **Step 1: Write failing tests:**
  - `{ageRating: 18}` gives ADULT. `{ageRating: 16}` gives MATURE. `{ageRating: 0}` gives EVERYONE.
  - `{genres: ["Hentai"]}` gives ADULT. `{genres: ["Ecchi"]}` gives MATURE. `{}` gives EVERYONE.
  - `{ageRating: 0, genres: ["hentai"]}` gives ADULT (the higher one wins).
  - `{ageRating: 16, genres: ["smut"]}` gives ADULT.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement: the higher of the age rating (18 and over is ADULT, 16 and over is MATURE) and the genre rating (lower-cased match).
- [ ] **Step 4:** Run `npm run test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(komga): content rating from age rating and genres`

### Task 5: Komga client, interceptor and connection check

**Files:**

- Create: `src/Komga/services/network.ts`, `src/Komga/services/interceptor.ts`, `src/Komga/implementations/shared/models.ts`, `src/Komga/implementations/shared/connection.ts`
- Modify: `src/Komga/main.ts` (register the interceptor in `initialise`)
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Produces, in `models.ts`: the Komga response types the later tasks read, with only the fields used. `SeriesDto`, `SeriesMetadata`, `BookDto`, `PageDto`, `LibraryDto`, `CollectionDto`, `Page<T> = {content: T[]; last: boolean; number: number}`, `TachiyomiProgressV2 = {lastReadContinuousNumberSort: number}`, `UserDto = {email?: string}`. Field names come from Komga's API (check `/tmp/komga-old/src/Komga/sdk/types.gen.ts`).
- Produces, in `network.ts`:
  - `class KomgaHttpError extends Error { status: number }`.
  - `komgaFetch<T>(path: string, opts?: {method?: "GET"|"POST"|"PUT"|"PATCH"|"DELETE"; query?: Record<string, string | number | boolean | string[] | undefined>; body?: unknown; baseUrl?: string; credentials?: {username: string; password: string}}): Promise<T>`. Builds `getBaseUrl() + path` (or the given `baseUrl`), repeats the key for array query values, sends a JSON body with `Content-Type: application/json`, and parses JSON. A status of 400 or above throws `KomgaHttpError`. A transport failure throws `Error("Could not reach <base>")`. An empty body resolves `undefined`.
  - `seriesThumbnail(id: string): string`, `bookThumbnail(id: string): string`, `pageUrl(bookId: string, n: number, mediaType: string): string` (adds `?convert=png` unless the type is jpeg, png, gif or webp).
- Produces, in `interceptor.ts`: `class KomgaInterceptor extends PaperbackInterceptor`. It adds `Authorization: Basic <base64(user:pass)>` only when the request URL starts with `getBaseUrl()` and has no `Authorization` header. It treats `request.headers` as optional and never throws. Base64 must handle UTF-8 credentials: encode the bytes, not `btoa(string)`.
- Produces, in `connection.ts`:
  - `type ConnectionResult = {ok: boolean; message: string}`.
  - `classifyConnection(input: {status?: number; user?: UserDto; reached: boolean; baseUrl: string}): ConnectionResult` (pure).
  - `checkConnection(baseUrl?: string, credentials?: {username: string; password: string}): Promise<ConnectionResult>`. It calls `/api/v2/users/me`, then `classifyConnection`, and never throws.

- [ ] **Step 1: Write failing tests** for `classifyConnection`, with the spec's exact messages:
  - `{status: 200, user: {email: "a@b.c"}, reached: true}` gives `{ok: true, message: "Connected as a@b.c"}`.
  - `{status: 200, user: undefined, reached: true}` gives `{ok: false, message: "That URL is not a Komga API endpoint"}`.
  - 401 and 403 give "Invalid credentials". 404 gives "No Komga server at that URL". 500 gives "Server returned 500".
  - `{reached: false, baseUrl: "https://x"}` gives "Could not reach https://x".
  - `pageUrl("b", 3, "image/avif")` ends with `/api/v1/books/b/pages/3?convert=png`. `pageUrl("b", 3, "image/webp")` has no query.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement the four files. When the SPA answers with HTML, JSON parsing fails; `checkConnection` must treat that as `user: undefined` with the real status.
- [ ] **Step 4:** Run `npm run test`, then `npm run conformance`. Expected: pass, exit 0.
- [ ] **Step 5:** Commit: `feat(komga): komga client, auth interceptor and connection check`

### Task 6: Manga details

**Files:**

- Create: `src/Komga/implementations/manga/main.ts`, `src/Komga/implementations/manga/parsers.ts`
- Modify: `src/Komga/main.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Consumes: `komgaFetch`, `seriesThumbnail`, `parseContentRating`, `encodeTagId`, `capitalise`.
- Produces: `getMangaDetails(mangaId: string): Promise<SourceManga>`, plus `pickShareUrl(links: {label: string; url: string}[]): string | undefined` and `toSourceManga(series: SeriesDto): SourceManga` in `parsers.ts`.

- [ ] **Step 1: Write failing tests:**
  - `pickShareUrl([{label:"Web",url:"w"},{label:"My Anime List",url:"m"},{label:"AniList",url:"a"}])` gives `"a"`. `pickShareUrl([{label:"Web",url:"w"}])` gives `"w"`. `pickShareUrl([])` gives `undefined`.
  - `toSourceManga` on a fixture series checks every row of the spec's "Manga details" table: writer gives `author`, penciller gives `artist`, `secondaryTitles` from `alternateTitles`, and `additionalInfo` keys `language`, `readingDirection`, `publisher`, `books`, `totalBooks`, `booksRead`, `booksUnread`, `booksInProgress`. Tag ids use `encodeTagId`.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement. On a `KomgaHttpError` with status 404, throw `Error("Series not found")`. Rethrow other errors with their message.
- [ ] **Step 4:** Run `npm run test`. Expected: pass, including the default `getMangaDetails` test against the demo server.
- [ ] **Step 5:** Commit: `feat(komga): manga details`

### Task 7: Chapters, pages and the update check

**Files:**

- Create: `src/Komga/implementations/chapter-providing/main.ts`, `src/Komga/implementations/chapter-providing/parsers.ts`
- Modify: `src/Komga/main.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Consumes: `komgaFetch`, `pageUrl`, `parseChapterTitle`.
- Produces: `getChapters(sourceManga: SourceManga): Promise<Chapter[]>`, `getChapterDetails(chapter: Chapter): Promise<ChapterDetails>`, `processTitlesForUpdates(updateManager: UpdateManager, lastUpdateDate?: Date): Promise<void>`. Also, in `parsers.ts`:
  - `toChapter(book: BookDto, seriesLanguage: string | undefined, sourceManga: SourceManga): Chapter`.
  - `decideUpdatePriorities(queuedIds: string[], updatedIds: Set<string>, complete: boolean): Map<string, "high" | "skip">`. When `complete` is false, it returns only the `high` entries.

- [ ] **Step 1: Write failing tests:**
  - `decideUpdatePriorities(["a","b"], new Set(["a"]), true)` gives `a: high`, `b: skip`.
  - `decideUpdatePriorities(["a","b"], new Set(["a"]), false)` gives only `a: high`; `b` is absent.
  - `toChapter`: language `""` gives `langCode "UNKNOWN"`. Title `"Vol.02 Ch.016 - The Aria"` gives `title "The Aria"`, `volume 2`. No title gives `title ""`, `volume 0`. `sortingIndex` comes from `numberSort`, `creationDate` from `book.created`, and `publishDate` falls back to `fileLastModified`.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement. `getChapters` sends `POST /api/v1/books/list?unpaged=true` with `{condition: {allOf: [{seriesId: {operator: "is", value: id}}, {deleted: {operator: "isFalse"}}, {mediaStatus: {operator: "is", value: "READY"}}]}}`. The update check follows the spec: cutoff one hour before `lastUpdateDate`, size 40, `deleted=false`, at most 50 pages. `complete` is true when it reached the cutoff or `last`. A failed request returns with no changes.
- [ ] **Step 4:** Run `npm run test`. Expected: pass, including the default chapter tests.
- [ ] **Step 5:** Commit: `feat(komga): chapters, pages and one-request update check`

### Task 8: Search

**Files:**

- Create: `src/Komga/implementations/search-results/main.ts`, `src/Komga/implementations/search-results/forms.ts`, `src/Komga/implementations/shared/filters.ts`
- Modify: `src/Komga/main.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Consumes: `komgaFetch`, `decodeTagId`, `encodeTagId`, state getters, `parseContentRating`, `seriesThumbnail`.
- Produces, in `filters.ts` (Task 9 uses these too):
  - `hiddenGenreConditions(): object[]`: `genre isNot <g>` for each adult genre when hiding; otherwise `[]`.
  - `scopeConditions(): object[]`: `anyOf libraryId is <id>` when libraries are selected, plus `oneShot isFalse` when one-shots are excluded.
  - `scopeQuery(): {library_id?: string[]}`.
  - `isHiddenSeries(genres: string[]): boolean`.
- Produces, in `forms.ts`: `type KomgaSearchMetadata = {filters?: Record<string, Record<string, "included" | "excluded">>}` and `class KomgaSearchForm extends AdvancedSearchForm`. Its constructor takes `(query: SearchQuery<KomgaSearchMetadata>, groups: TagSection[])`, with one `TriStateSelectRow` per group (Genres, Tags, Libraries, Collections), shaped like MangaDex's `tagGroupSection`.
- Produces, in `main.ts`:
  - `getSearchResults(query, metadata: {page?: number} | undefined, sort: SortingOption | undefined): Promise<PagedResults<SearchResultItem>>`.
  - `getSortingOptions(): Promise<SortingOption[]>`.
  - `getAdvancedSearchForm(query): Promise<AdvancedSearchForm>`. It awaits the groups, and each lookup falls back to `[]`.
  - `buildSearchBody(title: string | undefined, filters: KomgaSearchMetadata["filters"], base: object[]): object` (pure).

- [ ] **Step 1: Write failing tests:**
  - `buildSearchBody("x", {genres: {[encodeTagId("genre","Science Fiction")]: "included", [encodeTagId("genre","日本語")]: "excluded"}}, [])` deep-equals `{fullTextSearch: "x", condition: {allOf: [{genre: {operator: "is", value: "Science Fiction"}}, {genre: {operator: "isNot", value: "日本語"}}]}}`. The value must not be `"Science%20Fiction"`.
  - `buildSearchBody("", undefined, [])` has no `condition` key.
  - Sorting option ids and Komga sorts match the spec's table: `titleAsc`, `titleDesc`, `recentlyAdded`, `recentlyUpdated`, `recentlyRead`, `mostChapters`.
  - Review Focus 1: `getSearchResults` with the base URL set to `http://127.0.0.1:9` resolves to `{items: []}`. Save and restore the real URL around the test.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement. Send `POST /api/v1/series/list` with `page`, `size=40` and `sort`. There is a next page only when 40 items came back. Collections load every page. A thrown error in `getSearchResults` returns `{items: []}` and logs.
- [ ] **Step 4:** Run `npm run test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(komga): search with native filters and verified sorts`

### Task 9: Discover sections

**Files:**

- Create: `src/Komga/implementations/discover-section/main.ts`, `src/Komga/implementations/discover-section/sections.ts`, `src/Komga/implementations/discover-section/items.ts`
- Modify: `src/Komga/main.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Consumes: `filters.ts`, state getters, `komgaFetch`, the thumbnail helpers, `parseContentRating`, `encodeTagId`.
- Produces:
  - `DISCOVER_SECTIONS: {id: string; title: string; subtitle: string; fixedStyle?: boolean}[]`, with the six ids and titles from the spec, in order.
  - `getDiscoverSections(): Promise<DiscoverSection[]>`: skips hidden sections. The style maps to `simpleCarousel`, `prominentCarousel` or `featured`; Genres uses `genres`.
  - `getDiscoverSectionItems(section, metadata): Promise<PagedResults<DiscoverSectionItem>>`. It returns `{items: []}` on any error.
  - `sortNearlyFinished(series: SeriesDto[]): SeriesDto[]` (pure): keeps `booksUnreadCount > 0`, sorts ascending, takes the first 40.
  - `seriesItem(s: SeriesDto, style: SectionStyle): DiscoverSectionItem` and `onDeckItem(b: BookDto, style: SectionStyle): DiscoverSectionItem`. Both handle all three styles.

- [ ] **Step 1: Write failing tests:**
  - `sortNearlyFinished` on unread counts `[5, 0, 1, 3]` gives `[1, 3, 5]`.
  - `onDeckItem(book, "hero").type` is `"featuredCarouselItem"`. `seriesItem(s, "large")` has the subtitle `"2 of 10 read"` for 2 read out of 10 books.
  - `getDiscoverSections()` with `sectionStyle.genres` set to `hidden` leaves out `genres`.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement each section as the spec's table says. On Deck: `GET /api/v1/books/ondeck` with `scopeQuery()` and `page`. Drop books whose series is hidden (one unpaged lookup per call) and, when one-shots are excluded, books whose `oneshot` is true. Genres: `GET /api/v1/genres` with `library_id` when libraries are selected; check on the demo server that the param is honoured, and if it is not, drop it and add a code comment. A tap on a genre searches with `{filters: {genres: {[encodeTagId("genre", g)]: "included"}}}`.
- [ ] **Step 4:** Run `npm run test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(komga): home sections with per-section styles`

### Task 10: Progress

**Files:**

- Create: `src/Komga/implementations/progress/main.ts`, `src/Komga/implementations/progress/forms.ts`
- Modify: `src/Komga/main.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Consumes: `getChapters`, `komgaFetch`, `chapterLabel`.
- Produces:
  - `chapterForProgress(chapters: Chapter[], value: number): Chapter | undefined` (pure): the highest `sortingIndex ?? chapNum` that is at or below `value`, or `undefined` when `value <= 0`.
  - `getMangaProgress(sourceManga): Promise<MangaProgress | undefined>`.
  - `getMangaProgressManagementForm(sourceManga): Promise<Form>`.
  - `processChapterReadActionQueue(actions): Promise<ChapterReadActionQueueProcessingResult>`.
  - `class KomgaProgressForm extends Form`, with `requiresExplicitSubmission = true`.

- [ ] **Step 1: Write failing tests:**
  - `chapterForProgress` with sorting indexes `[1, 2, 3]` and value `2.5` gives the chapter at 2. Value `0` gives `undefined`. Value `10` gives 3.
  - `processChapterReadActionQueue` with the base URL set to `http://127.0.0.1:9` and two actions resolves with both ids in `failedItems`, and does not throw.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement as the spec's Progress section says. Pull uses `GET /api/v2/series/{id}/read-progress/tachiyomi`. The form label uses `chapterLabel`, and the footer reads: "Submit to sync this to Komga. Choosing No chapters read marks the series unread." Submit sends `PUT … {lastBookNumberSortRead}`, or `DELETE /api/v1/series/{id}/read-progress` for unread. Mark Read sends `POST` to the same path. Push sends `PATCH /api/v1/books/{chapterId}/read-progress {completed: true}`.
- [ ] **Step 4:** Run `npm run test`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(komga): reading progress pull, push and form`

### Task 11: Settings screens

**Files:**

- Create: `src/Komga/implementations/settings-form/main.ts`, `src/Komga/implementations/settings-form/forms/root.ts`, `forms/server.ts`, `forms/homepage.ts`, `forms/content.ts`
- Modify: `src/Komga/main.ts`
- Test: `src/tests/Komga.ts`

**Interfaces:**

- Consumes: state getters and setters, `checkConnection`, `DISCOVER_SECTIONS`, `komgaFetch` (genres, libraries).
- Produces: `getSettingsForm(): Promise<Form>`, plus four `Form` subclasses: `KomgaSettingsForm`, `KomgaServerForm`, `KomgaHomepageForm` and `KomgaContentForm`.

- [ ] **Step 1: Write a failing test:** build each form after the root's `formWillAppear` completes, collect every row id across all sections, and assert that none repeats. Then assert the server form's password row has `isSecureEntry: true`.
- [ ] **Step 2:** Run `npm run test`. Expected: fail.
- [ ] **Step 3:** Implement the screens as the spec's "Settings screens" section says. The labels match the spec exactly. Genre row ids use `encodeTagId("genre", g)`. Each Homepage or Content change saves and calls `Application.invalidateDiscoverSections()`. The server form's submit throws the `checkConnection` message when it is not ok, and saves through `setBaseUrl` and `setCredentials` when it is.
- [ ] **Step 4:** Run `npm run test`, then `npm run conformance`. Expected: pass, exit 0.
- [ ] **Step 5:** Commit: `feat(komga): settings screens with connection status`

### Task 12: Phone test checklist and the merge

**Files:**

- Create: `docs/komga-phone-test.md`

- [ ] **Step 1:** Write the checklist. Start with: remove the old Komga, run `npm run dev`, add `http://<LAN IP>:<port>` in Paperback, install, and note whether the settings came across. Then one line per spec item to check on the phone: each settings screen and status message, each home section in every style, search with each filter and both directions of each sort (the two title sorts must differ), details fields, chapter titles (`Ch.245`, `Vol.13 Ch.074.5`), page loading, progress pull, form and push, Hide Adult Content, library scope, one-shots, and the update check.
- [ ] **Step 2:** Run `npm run conformance` and `npm run test`. Expected: exit 0, all tests passed.
- [ ] **Step 3:** Commit: `docs(komga): phone test checklist`
- [ ] **Step 4:** Stop. Report to Exikle with the checklist. The merge into `0.9/stable` happens after their phone test, on their word.
