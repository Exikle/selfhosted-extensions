# Komga 4.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add groups A, B and C from the 4.1.0 design to the existing Komga extension without breaking anything that works today.

**Architecture:** Extend the existing `implementations/` folders. One new folder, `implementations/managed-collection/`. Shared pieces go in `implementations/shared/`: Lucene escaping, condition builders, and the book-section series lookup.

**Tech Stack:** TypeScript 7, `@paperback/types` and `@paperback/toolchain` `1.0.0-alpha.95`, oxlint, oxfmt, and `paperback-cli test` with chai.

**Spec:** `docs/superpowers/specs/2026-11-26-komga-next-design.md` (contract for the new features). `docs/superpowers/specs/2026-11-26-komga-redesign-design.md` (contract for everything that already exists).

## Global Constraints

- Work only in `/home/exikle/selfhosted-extensions/.worktrees/feat-komga-next`, branch `feat/komga-next`.
- Commits: one line, no attribution. Stage files by name and run `git diff --staged` first. Never use `--no-verify`.
- Every `.ts` file under `src/Komga` starts with `/* SPDX-License-Identifier: GPL-3.0-or-later */` and `/* Copyright © 2026 Exikle */`. Imports there are extensionless; tests use `.js`.
- Komga operators are lowercase (`is`, `isNot`, `isFalse`, `isNull`, `isNotNull`). Enum values are UPPERCASE (`UNREAD`, `IN_PROGRESS`, `READ`, `ONGOING`, `ENDED`, `HIATUS`, `ABANDONED`, `READY`).
- Use `PAGE_SIZE` from `shared/models.ts`; never redefine 40. Use `errorMessage` from `shared/utils.ts`. Log lines start with `[Komga] `.
- Never-throw rules: search, the search form, discover items, the connection check, progress push, interceptors, managed-collection reads and changes (except "all changes failed"), and the update check.
- Existing setting keys keep their names and meaning. New keys: `serverApiKey` (secure), `readList.<id>` (boolean, default off).
- `npm run test` exits 0 even on failure. A pass means the summary line shows `Failed: 0`. `npm run conformance` must exit 0 at the end of every task.
- Tests reuse `withResponse`, `routeRequests` and `withSearchState` in `src/tests/Komga.ts`, and restore global state in `finally`.
- Canadian spelling in labels and docs.

## Review Focus

1. **A search with a Lucene character in the title** (`Re:Zero`, `Fate/Zero (2011)`) still returns results and never throws. Test in Task 2.
2. **An API key set, then cleared.** Requests go back to Basic auth, and no request ever carries both `X-API-Key` and `Authorization`. Test in Task 3.
3. **A non-admin account, or a collection with hidden series, syncing collections.** Every change fails with its reason, and no PATCH is sent. Test in Task 7.
4. **The read-list section of a read list deleted on the server.** It disappears without breaking Home. Test in Task 8.
5. **An update check where only metadata changed.** The series is `skip` and `setNewChapters` is not called. Test in Task 6.

---

### Task 1: SDK alpha.95, Keep Reading sort, webtoon flag

**Files:** `package.json`, `package-lock.json`, `src/Komga/implementations/discover-section/main.ts`, `src/Komga/implementations/manga/parsers.ts`, `src/tests/Komga.ts`

**Interfaces:**

- Produces: the code compiles against alpha.95. `toSourceManga(series)` sets `mangaInfo.isWebtoon`.

- [ ] **Step 1:** Run `npm install --save-dev --save-exact=false @paperback/types@1.0.0-alpha.95 @paperback/toolchain@1.0.0-alpha.95`. Keep the `^` range style used in `package.json`. Run `npm run tsc` and fix every type error the upgrade causes, changing nothing else. If the toolchain has no alpha.95, keep the newest toolchain alpha that exists and say so.
- [ ] **Step 2: Failing tests:**
  - The Keep Reading request URL has `sort=readDate,desc`, not `readProgress.readDate`.
  - `toSourceManga` with `readingDirection: "WEBTOON"` gives `isWebtoon: true`; with `LEFT_TO_RIGHT` it gives `false` or undefined.
- [ ] **Step 3:** Run `npm run test` and expect a failure. Implement. Run the tests again and expect them to pass. Run `npm run conformance` and expect exit 0.
- [ ] **Step 4:** Commit: `feat(komga): sdk alpha.95, keep reading sort and webtoon flag`

### Task 2: Search ranking

**Files:** `src/Komga/implementations/shared/lucene.ts` (new), `src/Komga/implementations/search-results/main.ts`, tests

**Interfaces:**

- Produces: `escapeLucene(text: string): string` and the `SORT_OPTIONS` entry `{ id: "bestMatch", label: "Best Match", sort: "relevance" }`, placed first.
- Produces: `resolveSort(sortId: string | undefined, title: string, filters: KomgaSearchMetadata["filters"]): string`. This is the one place that picks the Komga sort, and Task 4 extends it.

- [ ] **Step 1: Failing tests:**
  - `escapeLucene("Re:Zero (2011)")` returns `Re\:Zero \(2011\)`. Each of `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /` is escaped. Plain text is unchanged.
  - `resolveSort(undefined, "naruto", {})` and `resolveSort("bestMatch", "naruto", {})` both return `relevance`.
  - `resolveSort("bestMatch", "", {})` returns `metadata.titleSort,asc`.
  - `resolveSort("titleDesc", "x", {})` returns `metadata.titleSort,desc`.
  - `getSearchResults` sends `fullTextSearch` escaped and `sort=relevance` when there is text.
  - Review Focus 1: `"Re:Zero"` against a stubbed 200 returns its items.
- [ ] **Step 2:** Run the tests and expect a failure. Implement. Run them again and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): rank text searches by relevance and escape lucene characters`

### Task 3: API key login

**Files:** `shared/state.ts`, `services/interceptor.ts`, `services/network.ts`, `shared/connection.ts`, `settings-form/forms/server.ts`, tests

**Interfaces:**

- Produces:
  - `getApiKey(): string`, which returns `""` when unset.
  - `setApiKey(key: string): void`, stored in secure state under `serverApiKey`. It trims the value.
  - `authHeaders(creds: {username: string; password: string}, apiKey: string): Record<string, string>`. With a key it returns `{ "X-API-Key": key }`. Without one it returns `{ Authorization: basicAuthHeader(...) }`.
- Consumes: `basicAuthHeader`.
- `komgaFetch` gains `apiKey?: string` in `KomgaFetchOptions`, used by the connection check. `checkConnection(baseUrl?, credentials?, apiKey?)` gains a third parameter.

- [ ] **Step 1: Failing tests:**
  - `authHeaders` with a key gives only `X-API-Key`.
  - `authHeaders` without a key gives only `Authorization`.
  - The interceptor with a key set adds `X-API-Key` and no `Authorization`. With the key cleared it adds Basic again. This is Review Focus 2; restore state in `finally`.
  - The interceptor never overwrites an existing `X-API-Key` or `Authorization` header.
  - `classifyConnection` with a 401 and a key reads "Invalid API key". Without a key it reads "Invalid credentials".
  - The server form has an `api_key` row with `isSecureEntry: true`. Username and password rows have `isDisabled: true` while the typed key is non-empty.
  - Test Connection sends `X-API-Key` with the typed key.
  - Submit saves the key with `setApiKey`.
- [ ] **Step 2:** Implement. The footer text is exactly: "API keys need Komga 1.20 or later. Create one in Komga under Account settings." Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): log in with a komga api key`

### Task 4: Search filters, sorts and the publisher tag

**Files:** `search-results/forms.ts`, `search-results/main.ts`, `shared/utils.ts` (TagKind adds `"publisher"`), `manga/parsers.ts`, tests

**Interfaces:**

- `KomgaSearchMetadata` gains `author?: string`. The form gains the groups `readStatus`, `seriesStatus`, `publishers`, `languages` and `ageRatings` (TriStateSelectRow; `readStatus` is include-only) and an `InputRow` with id `author`.
- `CONDITION_FIELDS` gains:
  - `readStatus` → `readStatus`
  - `seriesStatus` → `seriesStatus`
  - `publishers` → `publisher`
  - `languages` → `language`
  - `ageRatings` → `ageRating`
- `ANY_OF_GROUPS` gains `readStatus`, `seriesStatus`, `publishers`, `languages` and `ageRatings`.
- Age rating ids:
  - `encodeTagId("ageRating", "None" | "<n>")`;
  - included `None` becomes `{ageRating: {operator: "isNull"}}` and excluded `None` becomes `isNotNull`;
  - numbers become `{ageRating: {operator: "is" | "isNot", value: <Int>}}`.
- `author` becomes `{author: {operator: "is", value: {name: <text>}}}` when the text is non-empty.
- `SORT_OPTIONS` gains `releaseDate` (`booksMetadata.releaseDate,desc`) and `random` (`random`).
- `resolveSort` returns `collection.number,asc` for Best Match with no text and exactly one included collection.
- `getSearchResults` returns no next page when the sort is `random`.
- The details page tagGroups gain `{id: "publishers", title: "Publisher", tags: [{id: encodeTagId("publisher", name), title: name}]}` when the publisher is set. The group id must equal the form group id `publishers`.

- [ ] **Step 1: Failing tests,** one per mapping above, with exact body fragments:
  - read status `IN_PROGRESS` plus `READ` gives `anyOf` of two `readStatus is`;
  - an excluded `ENDED` gives `seriesStatus isNot ENDED`;
  - age rating `None` included gives `isNull`, and `16` included gives `is 16` as a number;
  - author `Oda` gives the object value;
  - release date and random sorts map as listed;
  - random gives no next page on a full page;
  - the collection-order rule;
  - the publisher tag group id is `publishers`, and a search with that tag gives `publisher is <name>`.
  - The form lookups (`/api/v1/publishers`, `/api/v1/languages`, `/api/v1/age-ratings`) fall back to empty lists on a 500.
- [ ] **Step 2:** Implement. Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): search by read status, status, publisher, language, age rating and author`

### Task 5: Latest Chapters section and the shared book-section lookup

**Files:** `discover-section/sections.ts`, `discover-section/main.ts`, `discover-section/items.ts`, `settings-form/forms/homepage.ts`, tests

**Interfaces:**

- Produces `resolveBookSeries(books: BookDto[]): Promise<{ visible: BookDto[]; seriesById: Map<string, SeriesDto> }>`. It extracts On Deck's single series lookup: one unpaged `series/list` `anyOf seriesId` request, which drops books of hidden or missing series and one-shots when they are excluded. An empty input sends no request. Task 8 reuses it.
- Produces `chapterUpdateItem(book: BookDto, series: SeriesDto): ChapterUpdatesCarouselItem`:
  - `mangaId` = seriesId, `chapterId` = book id, `title` = series title;
  - `subtitle` = `chapterLabel` from the parsed book title and number;
  - `imageUrl` = `bookThumbnail`, `publishDate` = `new Date(book.created)`;
  - `contentRating` from the series.
- `DISCOVER_SECTIONS` gains `{id: "latestChapters", title: "Latest Chapters", fixedStyle: true}` right after `onDeck`, with section type `chapterUpdates`. Homepage Settings shows it as a toggle, like Genres.

- [ ] **Step 1: Failing tests:**
  - The request is `POST /books/list?sort=created,desc&size=40&page=0`. Its body `allOf` holds `deleted isFalse`, `mediaStatus is READY`, the library `anyOf` when libraries are selected, and `oneShot isFalse` when one-shots are excluded.
  - Items are `chapterUpdatesCarouselItem` with the fields above.
  - A hidden-genre series' book is dropped.
  - Exactly 2 requests per page.
  - The section is listed after On Deck, and hidden when toggled off.
  - On Deck still passes its existing tests after the extraction.
- [ ] **Step 2:** Implement. Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): latest chapters home section`

### Task 6: Faster update check

**Files:** `chapter-providing/main.ts`, `chapter-providing/parsers.ts`, tests

**Interfaces:**

- Produces `groupNewBooks(books: BookDto[], cutoff: Date): { bySeries: Map<string, BookDto[]>; reachedCutoff: boolean }` (pure). It walks books sorted `created` desc and stops at the first book whose `created` is at or before the cutoff.
- `processTitlesForUpdates` adds a book walk after the series walk:
  - `POST /books/list?sort=created,desc&size=40&page=N`, with `allOf` of the updated series ids (`anyOf seriesId is`), `deleted isFalse` and `mediaStatus is READY`;
  - at most 10 pages.
  - Then, for each updated queued series:
    - new books: `setNewChapters(id, newBooks mapped with toChapter)`, then priority `high`;
    - no new books, and the walk was complete: `skip` (metadata-only edit);
    - walk cut off by the cap, or the books request failed: `high` with no `setNewChapters`.
- The series walk and the 50-page rule do not change.

- [ ] **Step 1: Failing tests:**
  - `groupNewBooks` with books at T+2, T+1 and T−1 against cutoff T gives 2 books and `reachedCutoff: true`.
  - End to end with a fake UpdateManager that records `setNewChapters`, where series A has a new book and series B has none: A gets `setNewChapters` and `high`, B gets `skip`. This is Review Focus 5.
  - A failed books request gives `high` for both with no `setNewChapters`.
  - A one-throw in `setNewChapters` doesn't stop the rest.
- [ ] **Step 2:** Implement. Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): hand new chapters to the app in the update check`

### Task 7: Collections that sync both ways

**Files:** `implementations/managed-collection/main.ts` (new), `main.ts`, `pbconfig.ts` (add `MANAGED_COLLECTION_PROVIDING`, keeping capabilities in alphabetical order), `shared/models.ts` (`CollectionDto` gains `seriesIds: string[]`, `filtered: boolean`; `UserDto` gains `roles?: string[]`), tests

**Interfaces:**

- Produces `getManagedCollections(): Promise<ManagedCollection[]>`:
  - `GET /api/v1/collections?unpaged=true`, with `id` and `title`;
  - it never throws, and returns `[]` on error.
- Produces `getManagedCollectionItems(collections: ManagedCollection[]): Promise<ManagedCollectionItems[]>`:
  - one `GET /api/v1/collections/{id}/series?unpaged=true` per collection, mapped with `toSourceManga`;
  - a failed collection comes back with `items: []`.
- Produces `applyManagedCollectionChanges(changes: ManagedCollectionChange[]): Promise<ManagedCollectionChangeFailure[]>`:
  - it checks admin once with `GET /api/v2/users/me` (`roles` includes `ADMIN`);
  - it groups changes by collection, reads `GET /api/v1/collections/{id}` once each, and applies them in order (a `move` is a remove from `from` plus an add to `to`);
  - it fails a change that would empty a collection, or any change to a `filtered` collection;
  - it sends `PATCH /api/v1/collections/{id}` with `{seriesIds}` once per collection that changed;
  - it returns the failures, and throws only when every change failed.
  - Reasons, verbatim:
    - "Changing Komga collections needs an admin account"
    - "Komga collections can't be empty"
    - "This collection has series your account can't see"
    - the PATCH error message.

- [ ] **Step 1: Failing tests:**
  - **Non-admin (Review Focus 3):** every change fails with the admin reason, and no PATCH is sent. Since all changes failed, the call throws.
  - **Admin, add and remove on one collection:** one GET and one PATCH, with the expected `seriesIds`.
  - **`move`:** two PATCHes, one per collection.
  - **Emptying a collection:** fails with that reason, and the other changes still apply.
  - **`filtered` collection:** every change to it fails, and no PATCH is sent for it.
  - **PATCH 500:** those changes fail with the message, and the call doesn't throw when others succeeded.
  - **`getManagedCollections` on error:** returns `[]`.
- [ ] **Step 2:** Implement, modelled on Inkdex MangaDex `implementations/managed-collection/main.ts`, with no `exclusiveGroup`. Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): sync komga collections with the paperback library`

### Task 8: Collections and read lists on Home

**Files:** `discover-section/sections.ts`, `discover-section/main.ts`, `shared/state.ts`, `settings-form/forms/homepage.ts`, `shared/models.ts` (`ReadListDto = {id, name}`), tests

**Interfaces:**

- **State:** `getReadListEnabled(id: string): boolean` (default `false`) and `setReadListEnabled(id: string, on: boolean)`, under the key `readList.<id>`.
- **Collections section:** `{id: "collections", title: "Collections", fixedStyle: true}`, type `genres`.
  - Items are `genresCarouselItem`: `name` is the collection name, and `searchQuery` is `{title: "", metadata: {filters: {collections: {[encodeTagId("collection", id)]: "included"}}}}`.
  - A tap reaches Task 4's collection-order rule.
- **`getDiscoverSections()` becomes async-aware of read lists.** It fetches `GET /api/v1/readlists?unpaged=true` and appends a section for each enabled read list: `{id: "readList:<id>", title: <name>, type: chapterUpdates}`. A failed fetch adds no read-list sections.
- **Read-list items:** `GET /api/v1/readlists/{id}/books?page=N&size=40`, in read-list order, through `resolveBookSeries` and `chapterUpdateItem`. Paging follows `last`.
- **Homepage Settings:** a "Read Lists" section with a toggle per server read list (row id `read_list_<n>` by index, with the read-list id kept in a map). Each toggle invalidates discover sections. It shows "No read lists" when there are none or the fetch fails.

- [ ] **Step 1: Failing tests:**
  - The Collections items and their search query.
  - Enabled read lists appear as sections, and disabled ones don't.
  - **A read list missing from the server (Review Focus 4):** its section disappears, and the others still load.
  - Read-list items keep the server order and drop hidden series.
  - Homepage toggles save and invalidate.
  - A failed read-list fetch leaves the other sections intact.
- [ ] **Step 2:** Implement. Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): collections and read lists on home`

### Task 9: Title-page extras

**Files:** `manga/main.ts`, `manga/parsers.ts`, `search-results/forms.ts` (confirm that the `author` input row from Task 4 fills from a staff tap), tests

**Interfaces:**

- Produces `staffSection(series: SeriesDto): MangaInfoStaffSection | undefined`:
  - id `author`, title "Creators", one item per unique author name;
  - `staff.title` = the name, `staff.subtitle` = the roles, capitalised and joined with `, `;
  - `staff.imageUrl` = `seriesThumbnail(series.id)`, and `id` = the name;
  - undefined when there are no authors.
- Produces `relationSections(seriesId: string): Promise<MangaInfoRelationSection[]>`:
  - `GET /api/v1/series/{id}/collections`, then for each collection, `POST /series/list?sort=collection.number,asc&size=21` with `collectionId is <id>`;
  - it drops the series itself and caps at 20;
  - id `collection:<id>`, title `In <name>`;
  - items are `{id, imageUrl: seriesThumbnail, title}`;
  - it never throws, and returns `[]` on error.
- `getMangaDetails` sets `mangaInfo.extras = [staff, ...relations]` (leaving out undefined). It runs the relations lookup alongside nothing else and must not delay or fail the details. A failed lookup leaves `extras` without relations.

- [ ] **Step 1: Failing tests:**
  - Staff: two roles for one author are merged into one item; the image is the series thumbnail.
  - Relations exclude the series itself, cap at 20 and keep the order.
  - A collections lookup that returns 500 still gives a details page, with `extras` holding only staff.
- [ ] **Step 2:** Implement. Run the tests and expect a pass. Run conformance.
- [ ] **Step 3:** Commit: `feat(komga): creators and collection rows on the title page`

### Task 10: Version 4.1.0 and the phone checklist

**Files:** `src/Komga/pbconfig.ts`, `docs/komga-phone-test.md`

- [ ] **Step 1:** Set `version: "4.1.0"`.
- [ ] **Step 2:** In the checklist, add a "4.1.0" group with one checkbox per item in the spec's Testing section. Each box says what to tap and what you should see.
- [ ] **Step 3:** Run `npm run test` (summary `Failed: 0`) and `npm run conformance` (exit 0).
- [ ] **Step 4:** Commit: `chore(komga): 4.1.0 and phone checklist`
