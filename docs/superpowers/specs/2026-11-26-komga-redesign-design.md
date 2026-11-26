# Komga extension for Paperback 0.9: redesign

Date: 2026-11-26. Repo: `git.dcunha.io/Exikle/selfhosted-extensions`, branch `0.9/stable`.

## Intent

Exikle wants a Komga extension they own outright, in their own repo, with
nobody upstream to answer to. It is a fresh build in the style Inkdex uses for
its own extensions (`inkdex/general-extensions`, branch `0.9/stable`), not a
port of the old code. Komga is the focus. Other self-hosted extensions may
come later, so the repo layout must leave room for them.

The behaviour to match is everything in Paperback-iOS/extensions-default
PR #6 (Komga 3.1 to 3.9.4). The old code is reference only:
`git.dcunha.io/Exikle/extensions-default`, branch `0.9`, head `6d14ed8`.
The Behaviour section below was written from the PR body and a full read of
that code, so it is the contract. Where it differs from the old code, it
differs on purpose (see "Old bugs not to carry over").

## Goals

- Every feature in PR #6 works on Exikle's iPhone (Paperback 0.9) against
  their own Komga server.
- The code reads like an Inkdex extension: the same folder shape, headers and
  tooling.
- Upstream issues #3 (show Komga's read status in Paperback) and #4 (push read
  progress to Komga) stay fixed.
- Settings from 3.9.4 carry over with no re-entry.

## Non-goals

- Paperback 0.8 support.
- `Komga_2`, the fork's `0.8`, `komga-tracker-test` and `swagger-types`
  branches.
- Publishing a public repository URL. For now the phone loads the bundle from
  `npm run dev` on the LAN.
- New features beyond PR #6.

## Anti-goals

- Copying the old files across and tidying them. That is not the redesign.
- Keeping the 10,700-line generated `openapi-ts` SDK.
- Any code from Paperback's `compat/0.8` layer.
- Carrying over the old bugs listed under "Old bugs not to carry over".

## Constraints

- Toolchain from the template: `@paperback/types` and `@paperback/toolchain`
  `^1.0.0-alpha.92` (lockfile at alpha.92; alpha.95 is on npm), TypeScript 7,
  oxlint, oxfmt, husky pre-push.
- The source id is the folder name: `src/Komga`.
- Licence GPL-3.0-or-later. Each source file starts with the Inkdex-style
  header: `/* SPDX-License-Identifier: GPL-3.0-or-later */` and a copyright
  line for Exikle.
- `pbconfig.ts` credits Faizan Durrani (`FaizanDurrani`), Lemon
  (`FramboisePi`) and Exikle (`Exikle`).
- Canadian spelling in prose and UI text.
- Work happens on branch `feat/komga` in `.worktrees/feat-komga`, merged into
  `0.9/stable` with no outside review. Commit messages are one line, no body,
  no attribution.

## Approaches considered

1. **Port the old code into the new template.** Fastest, but it keeps the
   0.8 compat search form, the generated SDK and the old bugs. It is not the
   redesign Exikle asked for. Rejected.
2. **Flat Inkdex layout** (`main.ts`, `network.ts`, `models.ts`, `parsers.ts`,
   `forms/`), as used by the smaller Inkdex extensions such as MangaFire.
   Fine for a scraper, but Komga has six capabilities and four settings
   screens, so the files would grow large again. The old `komga.ts` reached
   979 lines this way.
3. **Inkdex "implementations" layout**, as used by MangaDex, Atsumaru,
   MangaTaro and QiScans: one folder per capability, a `shared/` folder, a
   `services/network.ts`, and a short `main.ts` that only wires them up.
   **Chosen.** Exikle asked for Inkdex's format, and MangaDex is the closest
   match to Komga: several settings screens, a status row, discover settings
   and a state migration step.

## Decisions Exikle made

| Decision | Choice |
| --- | --- |
| Source id | Keep `Komga`. Library entries carry over. The old repo's Komga is removed from the phone before this one is installed. |
| Version | `4.0.0` |
| Settings | Carry over by reusing the 3.9.4 setting key names |
| Publishing | Local only for now: `npm run dev` on the LAN |
| Repo shape | Inkdex format; room for other extensions later |

## Calls made for Exikle (theirs to overrule)

- **Hand-written Komga client** in `services/network.ts`, covering only the
  endpoints below, with the request and response types the extension needs.
- **Native 0.9 search form.** Use `AdvancedSearchForm` (a `Form`) the way
  Inkdex MangaDex's `implementations/search-results/forms.ts` does, not
  `SearchFilterForm` from `compat/0.8`.
- **No pre-3.7 settings conversion.** The old `showOnDeck`-style booleans are
  dropped. Exikle is already on 3.9.4.
- **GitHub-only workflows removed.** Forgejo runs `.github/workflows` when no
  `.forgejo/workflows` exists, so `bundle-deploy.yaml`,
  `registry-management.yaml` and `delete-branch-ext.yaml` (GitHub Pages
  publishing) would fail on every push. Delete them. Keep `conformance.yaml`
  and `test.yaml` only if they run on the Forgejo runner; otherwise delete them
  too and rely on the husky pre-push hook. Delete `dependabot.yml` (GitHub
  only).
- **`ContentTemplate` deleted** once the Komga folder exists, with its test
  file. Update `README.md` and `package.json` names to fit this repo.
- **Old bugs fixed, not copied.** See below.

## Layout

```
src/
  Komga/
    main.ts                     wires capabilities; registers interceptors (no state migration: keys are unchanged)
    pbconfig.ts                 4.0.0, credits, capabilities
    static/icon.png             copied from the old repo
    services/
      network.ts                Komga client: base URL, Basic auth, typed calls, never-throw helpers
      interceptor.ts            adds Basic auth to requests (pages, thumbnails, API)
    implementations/
      manga/                    getMangaDetails
      chapter-providing/        getChapters, getChapterDetails, processTitlesForUpdates
      search-results/           getSearchResults, getSortingOptions, getAdvancedSearchForm
      discover-section/         getDiscoverSections, getDiscoverSectionItems
      progress/                 getMangaProgress, getMangaProgressManagementForm, processChapterReadActionQueue
      settings-form/            getSettingsForm and its sub-forms
      shared/                   models, state (settings keys), titles, content rating, filters, utils
  tests/Komga.ts                registers the default suite, as Inkdex tests do
```

Everything Komga-specific stays inside `src/Komga`. A later extension gets
its own `src/<Name>` folder.

## Behaviour

Below is what the extension must do. File references point at the old code in
`extensions-default@6d14ed8`, `src/Komga/`.

### Capabilities

`CHAPTER_PROVIDING`, `SEARCH_RESULT_PROVIDING`, `SETTINGS_FORM_PROVIDING`,
`DISCOVER_SECTION_PROVIDING`, `PROGRESS_PROVIDING`. Extension content rating
`EVERYONE`, badge "Self hosted" (black background, white text).

### Komga endpoints

Auth is HTTP Basic from secure state on every call.

| Use | Call |
| --- | --- |
| Connection check | `GET /api/v2/users/me` |
| Genres | `GET /api/v1/genres` |
| Tags | `GET /api/v1/tags/series` |
| Collections | `GET /api/v1/collections` (fetch every page) |
| Libraries | `GET /api/v1/libraries` |
| Series details | `GET /api/v1/series/{id}` |
| Search, Keep Reading, Nearly Finished, hidden set | `POST /api/v1/series/list` |
| On Deck | `GET /api/v1/books/ondeck` |
| Recently Added | `GET /api/v1/series/new` |
| Recently Updated, update check | `GET /api/v1/series/updated` |
| Chapters | `POST /api/v1/books/list` |
| Pages | `GET /api/v1/books/{id}/pages` |
| Progress read / set | `GET` / `PUT /api/v2/series/{id}/read-progress/tachiyomi` |
| Mark series unread / read | `DELETE` / `POST /api/v1/series/{id}/read-progress` |
| Mark book read | `PATCH /api/v1/books/{id}/read-progress` |
| Images | `/api/v1/series/{id}/thumbnail`, `/api/v1/books/{id}/thumbnail`, `/api/v1/books/{id}/pages/{n}` |

Search filters go in the request body as JSON. They are never url-encoded.

### Settings keys (carry over from 3.9.4)

| Key | Store | Type | Default |
| --- | --- | --- | --- |
| `serverURL` | state | string | `https://demo.komga.org` |
| `serverUsername` | secure | string | the Komga demo username |
| `serverPassword` | secure | string | the Komga demo password |
| `hideAdultContent` | state | boolean | `false` |
| `adultGenres` | state | string[] | adult, hentai, smut, erotica, pornographic, mature, ecchi |
| `sectionStyle.<sectionId>` | state | `hidden` / `simple` / `large` / `hero` | `simple` |
| `selectedLibraries` | state | string[] | `[]` (all libraries) |
| `includeOneshots` | state | boolean | `true` |

Base URL is trimmed and loses trailing slashes, both when saved and when
read, so a value saved by 3.9.4 works without a migration step.

### Settings screens

- **Root.** A Status row checked when the screen appears ("Checking…" until
  then), and links to Server Settings, Homepage Settings and Content Settings.
  The Server Settings link shows the saved base URL.
- **Server Settings** (explicit submit). Base URL, Username, Password (masked).
  A Test Connection button checks the typed values without saving. Submit
  checks again and saves only on success; on failure the form stays open with
  the message.
- **Connection check.** `GET /api/v2/users/me`. Success needs a response with
  an `email`: "Connected as <email>". A 200 without one means Komga's SPA
  answered with `index.html`: "That URL is not a Komga API endpoint". 401/403:
  "Invalid credentials". 404: "No Komga server at that URL". Other status:
  "Server returned <status>". No response: "Could not reach <url>". It never
  throws.
- **Homepage Settings.** One row per section with Regular, Large, Hero and
  Hidden. Genres is an on/off toggle. Each change saves and calls
  `Application.invalidateDiscoverSections()`.
- **Content Settings.** Hide Adult Content toggle; Genres To Hide (server
  genres merged with the stored list); Libraries (none selected means all);
  Include One-Shots. Each change saves and invalidates discover sections.
- All row ids are unique.

### Manga details

| Paperback field | From Komga |
| --- | --- |
| `primaryTitle` | `metadata.title` |
| `secondaryTitles` | `metadata.alternateTitles[].title` |
| `thumbnailUrl` | series thumbnail URL |
| `contentRating` | see Content rating |
| `status` | `metadata.status`, lower-cased |
| `author` | `booksMetadata.authors` with role `writer`, joined `, ` |
| `artist` | role `penciller`, joined `, ` |
| `synopsis` | `metadata.summary`, else `booksMetadata.summary` |
| `tagGroups` | Genres, Tags |
| `shareUrl` | first link labelled AniList, then MangaDex, MangaUpdates, MyAnimeList (label lower-cased, spaces removed), else the first link |
| `additionalInfo` | `language`, `readingDirection`, `publisher`, book counts (books, total, read, unread, in progress) |

A 404 gives "Series not found"; other errors give their own message.

### Content rating

Take the higher of the two ratings: `ageRating` (18 and over is Adult, 16 and
over is Mature) and genres (any adult genre is Adult, any mature genre is
Mature). Otherwise Everyone. Used on details, search tiles and discover
tiles.

### Chapters

- `POST /api/v1/books/list`, unpaged, condition `allOf` of: this series,
  not deleted, media status READY.
- `chapNum` = `metadata.number` as a number; `sortingIndex` =
  `metadata.numberSort`; `volume` and `title` from the title parser;
  `langCode` = series language upper-cased, or `UNKNOWN` when empty;
  `publishDate` = `metadata.releaseDate`, else `fileLastModified`;
  `creationDate` = `book.created`.
- Pages: `/api/v1/books/{id}/pages/{n}`, adding `?convert=png` when the page
  type is not jpeg, png, gif or webp.

### Title parser

Peel tokens from the start of the title in a loop: a volume token (`Vol`,
`Vol.`, `Volume`, then a number or a placeholder), a chapter token (`Ch`,
`Ch.`, `Chapter`, then a number), and a separator (`-`, `–`, `—`, `:`, `|`).
The first numeric volume is kept. Drop the remainder when it is only the
chapter number. Placeholders are a fixed list only: `TBD`, `TBA`, `?`, `??`,
`???`, `NA`, `N/A`.

Expected results:

| Title (number) | Title out | Volume out |
| --- | --- | --- |
| `Chapter 254` (254) | none | none |
| `Ch.245` (245) | none | none |
| `Ch.040.5` (40.5) | none | none |
| `Vol.13 Ch.074.5` (74.5) | none | 13 |
| `Vol.TBD Ch.234` (234) | none | none |
| `Vol.02 Ch.016 - The Aria` (16) | The Aria | 2 |
| `Chapter 10 - Chapter 10` (10) | none | none |
| `Chapter 5 Part 2` (5) | Part 2 | none |
| `Vol.1 THE END` (1) | THE END | 1 |
| `Vol. THE Beginning` (1) | Vol. THE Beginning | none |
| `VOLCANO` (1) | VOLCANO | none |

### Update check

`processTitlesForUpdates`: do nothing when nothing is queued or there is no
`lastUpdateDate`. Cutoff = `lastUpdateDate` minus one hour. Page
`/api/v1/series/updated` (size 40, not deleted) until a series at or before
the cutoff, or the last page, up to 50 pages. A failed request returns and
changes nothing. Seen and newer than the cutoff: `high`. Otherwise `skip`,
**but only when the walk reached the cutoff or the last page**. If it stopped
at the 50-page cap, leave unseen series at their default priority. Known
limitation: metadata-only edits count as updates.

### Search

- Filters: Genres, Tags, Libraries, Collections, each multi-select with
  include and exclude. Loading them never throws: a failed lookup gives an
  empty list.
- The body is `{fullTextSearch, condition: {allOf: [...]}}`. Included is
  `is`, excluded is `isNot`. Hidden genres and library/one-shot scope are
  always added.
- Sort options (each checked asc and desc on a live server):

  | Label | Komga sort |
  | --- | --- |
  | Title (A–Z) | `metadata.titleSort,asc` (default) |
  | Title (Z–A) | `metadata.titleSort,desc` |
  | Recently Added | `created,desc` |
  | Recently Updated | `lastModified,desc` |
  | Recently Read | `readDate,desc` |
  | Most Chapters | `booksCount,desc` |

  The PR notes say Komga ignores `titleSort`, `releaseDate` and `folderName`
  and still returns 200. `metadata.titleSort` is a different field from
  `titleSort`. Re-check both title sorts during the phone test.
- Page size 40. Next page only when the page came back full.
- Never throws. On error, return an empty result, because Paperback calls it
  during global searches too.
- Tile: series thumbnail, `metadata.title`, content rating.

### Discover sections

| id | Title | Query |
| --- | --- | --- |
| `onDeck` | On Deck | `GET /books/ondeck`, library scope; one-shots and hidden genres filtered in the extension |
| `keepReading` | Keep Reading | series list, `readStatus IN_PROGRESS`, sort `readProgress.readDate,desc` |
| `nearlyFinished` | Nearly Finished | same condition, unpaged; sorted by fewest unread books in the extension (Komga cannot sort by `booksUnreadCount`); first 40 |
| `recentlyAdded` | Recently Added Series | `GET /series/new` |
| `recentlyUpdated` | Recently Updated Series | `GET /series/updated` |
| `genres` | Genres | `GET /genres`; adult genres dropped when hiding; a tap searches that genre |

- Library scope, one-shots and Hide Adult Content apply to every section.
- Styles: Regular = simple carousel, Large = prominent carousel (subtitle
  "<read> of <count> read"), Hero = featured (status · publisher, summary,
  book count, read count). On Deck supports all three; its items show the
  book title and book thumbnail.
- Failed loads show an empty section, not an error.

### Progress

- **Pull** (`getMangaProgress`): read `lastReadContinuousNumberSort` from the
  Tachiyomi v2 endpoint. 0 or missing means no progress. Otherwise the
  chapter with the highest `sortingIndex` at or below that value.
- **Form**: current progress (chapter title, or "Chapter <n>" when untitled,
  or "No chapters read"); a Last Read Chapter picker with "No chapters read"
  first; Mark Unread and Mark Read buttons. Submit with "No chapters read"
  marks the series unread; otherwise it sets `lastBookNumberSortRead`. The
  footer text matches the picker.
- **Push** (`processChapterReadActionQueue`): mark each book read with
  `PATCH /books/{id}/read-progress {completed: true}`. Every action lands in
  `successfulItems` or `failedItems`. Never throws.

### Never-throw rules

`getAdvancedSearchForm`, `getSearchResults`, discover items, the connection
check, progress push and every interceptor must not throw. Interceptors treat
`request.headers` as optional.

## Old bugs not to carry over

| Old bug | Fix in the redesign |
| --- | --- |
| Search throws when the server is down (`komga.ts:470`) | Return empty results |
| Search form gets an un-awaited Promise (`komga.ts:139`) | Await the filters |
| Update check marks everything skip at the 50-page cap (`komga.ts:595`) | Leave unseen series at default priority |
| On Deck ignores one-shots; Komga has no `oneshot` param there | Filter in the extension |
| On Deck Hero style builds the wrong item type | Build featured items |
| Genres section ignores library scope | Limit genres to the selected libraries (`/api/v1/genres?library_id=` if Komga supports it, else leave and note it) |
| Title parser eats uppercase words after `Vol` | Fixed placeholder list |
| `btoa` throws on non-Latin-1 genre and tag names | Ids that handle any Unicode (`encodeURIComponent`) |
| Untitled chapter shows "No chapters read" in the progress label | "Chapter <n>" |
| Content rating ignores genres when `ageRating` is set | Take the higher rating |
| Empty language gives an empty `langCode` | `UNKNOWN` |
| Chapter condition sends three keys in one object | `allOf` |
| Collections filter only reads the first page | Fetch every page |
| Search always makes one extra empty request | Stop when a page comes back short |

## Testing

- `npm run conformance` (tsc, oxlint, oxfmt) and `npm run test` must pass.
- Unit-style checks for the title parser and content rating, using the tables
  above, run through the test suite or a plain script.
- **The proof is the phone test**: `npm run dev`, add
  `http://<workstation LAN IP>:<port>` as a repository in Paperback, remove
  the old Komga first, install this one, and note whether the settings came
  across (if Paperback wiped them on removal, re-enter the server URL and
  login once; that is accepted). Then walk a checklist covering every
  section of this document against Exikle's Komga server. Exikle runs it.

## Left to the builder

- Exact file split inside each `implementations/` folder.
- Type definitions for Komga responses (write only what is used).
- How the title parser and content rating checks are run.
- Whether the Forgejo runner can run `conformance.yaml` and `test.yaml`.
- The phone test checklist wording.
