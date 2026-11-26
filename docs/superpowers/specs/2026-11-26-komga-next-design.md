# Komga extension: the next features (4.1.0)

Date: 2026-11-26. This builds on `2026-11-26-komga-redesign-design.md`, which stays the contract for everything that already exists.

## Intent

Komga 4.0.1 matches PR #6 feature for feature, with fixes. Exikle wants to go further: use what Paperback 0.9 (SDK alpha.95) and Komga offer that the extension leaves unused. They chose all three groups below (A, B and C). Research notes are in `/tmp/komga-unused-features.md` and `/tmp/paperback-unused-capabilities.md`. Load-bearing claims were checked in source; the source is named next to each claim.

## Goals

- Every item in groups A, B and C below works on Exikle's phone against their Komga server.
- Nothing that works today gets worse.
- The code keeps the Inkdex style and the never-throw rules of the redesign spec.

## Non-goals

- Page-level progress and pushing "mark unread". Paperback's read-action queue carries chapter reads only, so the extension never gets a page number or an unread action.
- OAuth login, Cloudflare bypass, ratings (Komga has no series rating), EPUB/PDF file chapters, Komga's notable entities.
- Creating or deleting Komga collections from Paperback. The managed-collection interface has no create.

## Constraints

- SDK: `@paperback/types` and `@paperback/toolchain` move to `1.0.0-alpha.95` (the `alpha` dist-tag; `latest` points at an old alpha.64). Inkdex MangaDex already uses the alpha.95 managed-collection API.
- Version `4.1.0`. New settings get new keys; existing keys and their meaning do not change.
- Komga minimums:
  - Searching through `/series/list` needs Komga 1.19 or later. This is already a requirement today.
  - API key login needs Komga 1.20.0 or later (the `X-API-Key` header).
- **Komga facts, checked in its source:**
  - Komga silently drops unknown sort keys.
  - The series sort map has `readDate`; `readProgress.readDate` is only a book key (`SeriesDtoDao.kt`, `BookDtoDao.kt`).
  - `relevance` only works together with a search term.
  - `collection.number` only works together with a `collectionId` condition.
  - Creating, updating or deleting a collection needs the ADMIN role (`SeriesCollectionController.kt`, `@PreAuthorize("hasRole('ADMIN')")`). Collections are shared by every user on the server.
  - Do not send an API key together with a session cookie. Basic auth and API key requests are sessionless, so this holds as long as the extension never stores cookies.
- Everything else is unchanged from the redesign spec: Inkdex style, the Exikle header, extensionless imports, lowercase Komga operators, page size 40 from `shared/models.ts`, never-throw rules, Canadian spelling.

## Approach

Ship one release, `4.1.0`, built in three ordered stages. Each stage leaves the extension working, and A goes first because C needs its SDK upgrade.

Approaches considered:
- **Three separate releases (4.0.2, 4.1.0, 4.2.0).** More version bumps for the user to install, and B and C share files (search form, settings, details), so they would conflict.
- **One release in stages (chosen).** One version for the user; the stages keep the build order safe.

## Behaviour

### A. Fixes and the SDK upgrade

1. **Keep Reading sort.** Send `readDate,desc` to `/series/list`. Today it sends `readProgress.readDate,desc`, which Komga drops, so the section was never sorted.
2. **Search ranking.**
   - When the search has text and the user picked no sort, or picked the new **Best match** option, send `sort=relevance`.
   - **Best match** is the first sort option, and it falls back to title A–Z when the search has no text.
   - Escape Lucene's reserved characters in the text, the way Mihon's Komga extension does: `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /`.
3. **SDK upgrade** to alpha.95. Fix whatever the type changes break, so that `tsc` passes.
4. **Webtoon flag.** Set `MangaInfo.isWebtoon = true` when `metadata.readingDirection` is `WEBTOON`.

### B. Small features

1. **API key login.**
   - Server Settings gains an **API Key** row: secure entry, stored in secure state under `serverApiKey`.
   - When a key is set, every request sends `X-API-Key: <key>` and no `Authorization` header. This covers the API, thumbnails, pages and the connection check.
   - Username and Password stay visible but are disabled with `isDisabled` while a key is set.
   - Test Connection and submit use the typed key.
   - A footer explains: "API keys need Komga 1.20 or later. Create one in Komga under Account settings."
   - A 401 with a key reads "Invalid API key".
2. **Latest Chapters home section.**
   - New section id `latestChapters`, titled "Latest Chapters", with type `chapterUpdates`. It shows newly *added* books.
   - Source: `POST /api/v1/books/list?sort=created,desc&size=40&page=N`, not `/books/latest`. `/books/latest` takes no `library_id` or one-shot filter, and also returns edited books.
   - The `allOf` body holds:
     - `deleted isFalse`;
     - `mediaStatus is READY`;
     - an `anyOf` of `libraryId is X` when libraries are selected;
     - `oneShot isFalse` when one-shots are excluded.
   - Paging works like the other sections: 40 per page.
   - Items are `chapterUpdatesCarouselItem`:
     - `mangaId` = seriesId, `chapterId` = book id
     - `title` = series title, `subtitle` = chapter label
     - `imageUrl` = book thumbnail, `publishDate` = book `created`
     - `contentRating` from the series
   - Hidden genres and content ratings come from the same single series lookup On Deck uses.
   - Homepage Settings shows it as an on/off toggle, like Genres. It is on by default and placed after On Deck.
3. **More search filters.** These are added to the advanced search form; each one maps to a `/series/list` condition. Operators are lowercase (`is`, `isNot`). Enum *values* are UPPERCASE: `readStatus` is `UNREAD`, `IN_PROGRESS` or `READ`; `seriesStatus` is `ONGOING`, `ENDED`, `HIATUS` or `ABANDONED`. A wrong case fails the whole request.

   | Filter | Kind | Condition |
   | --- | --- | --- |
   | Read status | Unread, In progress, Read; include only | `readStatus is X`. Several values are combined with `anyOf` |
   | Series status | Ongoing, Ended, Hiatus, Abandoned; include/exclude | `seriesStatus` |
   | Publisher | List from `GET /api/v1/publishers`; include/exclude | `publisher` |
   | Language | List from `GET /api/v1/languages`; include/exclude | `language` |
   | Age rating | List from `GET /api/v1/age-ratings`; include/exclude | `ageRating`. The value is an Int. The list's `"None"` maps to `isNull` when included and `isNotNull` when excluded; numbers map to `is` or `isNot` with the Int |
   | Author | Text input: a new `InputRow` with id `author`, value stored in `KomgaSearchMetadata.author` | `author is {name: <text>}`, any role. The value is an object, not a string |

   - The v1 referential endpoints (`publishers`, `languages`, `age-ratings`) are deprecated since Komga 1.26 but still work. Use them; the v2 replacements are paged.

   - Included values within one group are combined with `anyOf` for publisher, language, age rating and series status, the way libraries already work. Exclusions stay `isNot` in `allOf`.
   - New sort options:
     - **Release Date** (`booksMetadata.releaseDate,desc`).
     - **Random** (`random`). Random returns one page only, with no next page, because every page reshuffles and would repeat or skip series.
   - Each lookup falls back to an empty list; the form never throws.
4. **Publisher on the details page.**
   - A "Publisher" tag group, with group id `publisher`, holds one tag with the id `encodeTagId("publisher", name)`.
   - The search form's publisher group uses the same id, `publisher`, and `CONDITION_FIELDS` maps `publisher` to the `publisher` condition.
   - Search already keys conditions by form group id. With matching ids, a tap on the tag searches that publisher, as genre and tag taps do today.
   - Authors are covered by C3.
5. **Faster update check.**
   - Komga's book search has no date condition (checked in `SearchCondition.kt`; book *sort* keys do include `created`).
   - So after `processTitlesForUpdates` finds the updated queued series, it pages `POST /books/list?sort=created,desc&size=40`. The `allOf` body holds:
     - `anyOf` of `seriesId is` for each updated series;
     - `deleted isFalse`;
     - `mediaStatus is READY`.
   - It stops at the first book created at or before the cutoff, or on the last page, or after 10 pages.
   - Results are grouped by series:
     - A series with new books gets `setNewChapters(id, newBooksOnly)`, using the same `toChapter` mapping as `getChapters`, and priority `high`. `sortingIndex` is the absolute `numberSort`, so a partial list is safe.
     - A series that changed only its metadata (no new books) gets `skip`. This also fixes the known limitation that metadata-only edits count as updates.
   - If the walk hits the 10-page cap, the series not yet seen get `high` with no `setNewChapters`.
   - If the books request fails, fall back to today's behaviour: mark them `high` without `setNewChapters`.
   - The 50-page cap rule stays as it is.

### C. Bigger features

1. **Collections that sync both ways.** The extension declares `MANAGED_COLLECTION_PROVIDING`. The method shapes follow Inkdex MangaDex `implementations/managed-collection/main.ts`, minus `exclusiveGroup`, because a series can be in many collections.
   - `getManagedCollections`: one collection per Komga collection, from `GET /api/v1/collections?unpaged=true`, with `id` = collection id and `title` = name.
   - `getManagedCollectionItems(collections)`: for each collection, `GET /api/v1/collections/{id}/series` (unpaged), mapped to SourceManga.
   - `applyManagedCollectionChanges(changes)`:
     - If `/api/v2/users/me` shows no `ADMIN` role, every change fails with the reason "Changing Komga collections needs an admin account".
     - Otherwise, group the changes by collection. For each collection, read its current `seriesIds` once, apply the adds and removes in order (a `move` is a remove plus an add), then `PATCH /api/v1/collections/{id}` with the new `seriesIds`.
     - These changes fail with a reason instead of writing:
       - a change that would leave a collection empty. Komga's `seriesIds` must not be empty, and deleting collections is out of scope. Reason: "Komga collections can't be empty".
       - any change to a collection whose `filtered` flag is true. Some series are hidden from this account, so a PATCH would delete them. Reason: "This collection has series your account can't see".
     - Return the changes that failed, each with a reason. Throw only when none were applied.
   - The PATCH replaces the whole list. Re-reading just before writing keeps the window for lost updates small. That is acceptable on a single-user server.
2. **Collections and read lists on Home.**
   - A **Collections** section (id `collections`, type `genres`): one item per collection. Tapping it searches with that collection included.
     - When the sort is Best match, the search has no text, and exactly one collection is included, send `collection.number,asc`, so the series come back in the collection's own order. Paperback may always pass the first sort option, so "no sort" can't be relied on.
     - The Collections section is on by default, as every section is.
   - **Read list sections.** Homepage Settings lists the server's read lists, each with a toggle; all are off by default. They need their own default, because `getSectionStyle` treats unknown ids as on. Each one turned on becomes its own section:
     - id `readList:<id>`, titled with the read list's name, type `chapterUpdates`;
     - books come from `GET /api/v1/readlists/{id}/books` in read-list order, as `chapterUpdatesCarouselItem` items;
     - library scope, hidden genres and one-shots are filtered the same way as Latest Chapters.
   - Section ids made from data must stay unique and stable. A deleted read list simply disappears.
3. **Title-page extras** (`MangaInfo.extras`).
   - **Staff:** one section, id `author`, titled "Creators". It holds one item per unique `booksMetadata.authors` name:
     - `staff.title` = name, `staff.subtitle` = roles joined with ", " and capitalised;
     - `staff.imageUrl` = the series thumbnail, because Komga has no author images;
     - `id` = name.
     - Tapping a person fills the search form's `author` input row (B3), as the alpha.95 type documents.
   - **Relations:** for each collection the series is in (`GET /api/v1/series/{id}/collections`), one relation section, id `collection:<id>`, titled "In <collection name>".
     - Items are the other series in that collection, up to 20, in collection order. `subtitle` is left unset.
   - A failed extras lookup leaves `extras` unset. Details never fail because of extras.

## Old behaviour that changes

- Keep Reading is now actually sorted by most recent read.
- Search with text is ranked by relevance unless you pick another sort.
- A series whose only change was metadata no longer counts as updated (B5).
- Homepage Settings gains the Latest Chapters toggle, the Collections toggle and a read-list group.

## Testing

- **Unit tests** cover each condition body, each sort mapping, Lucene escaping, the API key header choice, the managed-collection change grouping and its admin gate, the `setNewChapters` grouping, and the extras mapping. Stubs use the existing `withResponse`, `routeRequests` and `withSearchState` helpers.
- `npm run conformance` must pass. `npm run test` passes only when the summary line shows 0 failed, because it exits 0 even when tests fail.
- **Phone checklist additions:**
  - API key login;
  - the Latest Chapters section opens the chapter;
  - search ranking, plus each new filter and sort;
  - the publisher tag;
  - updates skip metadata-only edits;
  - collection sync: add and remove, in both directions;
  - the Collections section and a read-list section;
  - Creators and the "In <collection>" sections on a title page;
  - webtoon series open in vertical scroll.

## Left to the builder

- The exact file split, following the existing `implementations/` folders. Managed collections get `implementations/managed-collection/`.
- How Lucene escaping is written.
- Whether the read-list toggles live in Homepage Settings or a sub-page.
- The wording of new labels, as long as it uses Canadian spelling.
