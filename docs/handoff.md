# Handoff: redesign the Komga extension for Paperback 0.9

Written 2026-11-26 for a new session that starts in `~/selfhosted-extensions`.

## Goal

Build a redesigned Komga extension for **Paperback 0.9** in this repo. The user
owns this repo and wants no upstream oversight. Nobody else reviews or merges
here.

"Redesign" is the user's word. They want it built their own way, not copied
over. **Start with `superpowers:brainstorming`** and settle the design with the
user before writing code.

## Where things are

| What                            | Where                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| This repo                       | `git.dcunha.io/Exikle/selfhosted-extensions` (public), local `~/selfhosted-extensions`, branch `0.9/stable` |
| Starting scaffold               | Fresh copy of `inkdex/template-extensions` (branch `0.9/stable`), with no upstream remote                   |
| Old Komga code (reference only) | `git.dcunha.io/Exikle/extensions-default`, branch `0.9`, head `6d14ed8`, version 3.9.4                      |
| The PR in scope                 | <https://github.com/Paperback-iOS/extensions-default/pull/6>, open, head = the fork's `0.9` branch          |
| How Inkdex lays out a real repo | `inkdex/general-extensions`, branch `0.9/stable`                                                            |

## Scope

The new extension must cover **everything in PR #6**. The PR body is the
feature list. Read it in full:
`gh pr view 6 -R Paperback-iOS/extensions-default`. In short:

- Chapter title parsing (`Ch.245`, `Vol.13 Ch.074.5`), and recovering the volume
- Search filters sent as JSON, not url-encoded
- `getSearchFilters` and the image interceptor must never throw
- Settings: unique row ids, a masked password, a clear error on 404 or no host
- Metadata: real `contentRating`, `alternateTitles`, `readingDirection`, `publisher`, `shareUrl`
- Hide Adult Content, verified search sort options, a connection test
- One-request update check through `/series/updated`, with a cutoff one hour earlier than the last check
- Home sections: On Deck, Keep Reading, Recently Added Series, Recently Updated Series, genres, featured, Nearly Finished. Each section can be set to Regular, Large, Hero or Hidden
- Connection status on the settings screen. A bare 200 does not count, because Komga's SPA answers unknown paths with `index.html`
- Library scope and one-shot filtering, used in browsing and search
- Progress form (chapter names), and progress sync (`PROGRESS_PROVIDING`)

The PR's comments say it also fixes upstream issues #3 and #4. Check that those
fixes survive the redesign.

Facts the PR worked out that the rebuild must keep:

- Komga ignores sort fields it does not know and still returns 200. Test every
  sort option asc and desc and check the results differ. `titleSort`,
  `releaseDate` and `folderName` are ignored.
- Komga cannot sort by `booksUnreadCount`, so Nearly Finished is sorted in the
  extension.
- `/series/updated` also includes edits that only changed metadata. This is a
  known limitation.

## Not in scope

- `Komga_2`: an empty 11-line copy of Komga. Drop it.
- Paperback 0.8, and the fork's `0.8` branch.
- The fork's `komga-tracker-test` and `swagger-types` branches. They are 2023 upstream leftovers.
- The template's `ContentTemplate` example. Use it as a reference, then delete it.

## Decisions for the brainstorm

1. **Source id.** The folder name (`src/Komga`) is the source id in Paperback.
   - Keep `Komga`: library entries and reading progress carry over, but the old
     repo's Komga must be removed from the phone first.
   - Use a new name: both can be installed side by side, but the library has to
     be added again.
2. **Version.** Start at 4.0.0 (a redesign, and the settings may not migrate),
   or continue from 3.9.4.
3. **Publishing.** Forgejo has no Pages feature, and the template's workflows
   are GitHub Actions. Options: push-mirror to GitHub and keep the workflows,
   rewrite them for Forgejo Actions and host the bundle elsewhere, or serve
   `bundles/` from the Artemis cluster.
4. **The Komga SDK.** The old code used an `openapi-ts` generated client
   (about 10,700 lines in `src/Komga/sdk`). Regenerate it, or replace it with a
   smaller hand-written client.
5. **Settings migration.** Settings from 3.9.4 must either migrate or reset.

## Testing

The user tests on their own iPhone with Paperback 0.9 and their own Komga
server.

- `npm run dev` (`paperback-cli serve --watch`) serves the bundle on the LAN.
  Add `http://<workstation LAN IP>:<port>` as a repository in Paperback on the
  phone. Read the port from the serve output. The workstation is CachyOS.
- `npm run test` runs `paperback-cli test`. `npm run conformance` runs tsc,
  oxlint and oxfmt.
- The phone test is the proof. A green `npm run test` does not show that the
  extension works in the app.

## Rules

- Work in a worktree on its own branch (global rules), then merge into
  `0.9/stable`. This is the user's own repo, so there is no outside review.
  Commit messages are a single line, with no attribution.
- Licence is GPL-3.0-or-later (from the template and the original Komga code).
  Keep the original developer credits in `pbconfig.ts` (Faizan Durrani, Lemon)
  next to Exikle's.
- Use Canadian spelling in prose.
