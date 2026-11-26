# Self-hosted Extensions

A Komga extension for Paperback 0.9.

Built on the [Inkdex template-extensions](https://github.com/inkdex/template-extensions) scaffold.

## Install

In Paperback, add this repository:

```
https://exikle.github.io/selfhosted-extensions/0.9/stable
```

Paperback only accepts HTTPS repositories.

## Requirements

- Komga 1.19 or later.
- API key login needs Komga 1.20 or later.
- Collection sync needs a Komga admin account.

## Features

Reading

- Chapter names are cleaned up, such as `Vol.13 Ch.074.5`.
- Reading progress syncs both ways with Komga.
- Webtoon series open in vertical scroll.
- Title pages list Creators and "In <collection>" rows.
- Title pages show a Publisher tag. Tap it to search.

Home

- On Deck, Keep Reading, Nearly Finished, Recently Added Series and Recently Updated Series.
- Latest Chapters shows your newest books.
- Genres and Collections rows. Tap one to search.
- Read-list rows. Turn on the ones you want.
- Each row can be Regular, Large, Hero or Hidden.

Search

- Search by text. Best matches come first.
- Filters: Genres, Tags, Libraries, Collections, Read Status, Series Status, Publishers, Languages, Age Ratings and Author.
- Sorts: Best Match, Title, Recently Added, Recently Updated, Recently Read, Most Chapters, Release Date and Random.

Sync

- Komga collections show up in Paperback. Changes go both ways.
- The update check skips series where only the metadata changed.

Settings

- Log in with a username and password, or with an API key.
- Hide adult content, pick libraries and leave out one-shots.
- About shows the extension and Komga versions.

## Settings

- **Server:** server URL, username, password, API key and a connection test.
- **Homepage:** the style of each Home row, and which read lists to show.
- **Content:** hide adult content, genres to hide, libraries and one-shots.
- **About:** the extension version, the Komga version, and warnings for old servers.

## Development

```
npm ci
npm run dev
npm run test
npm run conformance
```

- `npm run dev` makes a local build.
- `npm run test` exits 0 even when tests fail. Read the Passed and Failed summary.
- Forgejo is the main home of this repo. It push-mirrors to GitHub.
- Each push to `0.9/stable` builds the bundle and deploys GitHub Pages.

## Credits

- Exikle
- Faizan Durrani and Lemon, the original authors

Licence: GPL-3.0-or-later.
