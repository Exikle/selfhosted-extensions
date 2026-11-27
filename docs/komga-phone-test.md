# Komga phone test

You need: an iPhone with Paperback 0.9 and your Komga server.

`npm run test` exits 0 even when tests fail, so read its summary line.

## Setup

Paperback upgrades an installed Komga in place (same source id), so settings and library stay.

1. In Paperback, add `https://exikle.github.io/selfhosted-extensions/0.9/stable` as a repository. Paperback refuses plain `http://` repositories.
2. Install Komga (the current version) from that repository.
3. Open the Komga settings. Check whether the server URL and login came across.

## Install

- [ ] Server URL and login came across. If not, I re-entered them once.
- [ ] Hide Adult Content, Include One-Shots, the selected libraries and the section styles all carried over, not only the URL and login.

## Settings: root screen

- [ ] Open Komga settings. Status shows "Checking…", then "Connected as <email>".
- [ ] "Server Settings" shows my server URL under its name.
- [ ] "Homepage Settings" and "Content Settings" rows are there.

## Settings: Server Settings

- [ ] Type a wrong password. Tap "Test Connection". Footer says "Invalid credentials".
- [ ] Type a wrong URL. Tap "Test Connection". Footer shows a clear error, no crash.
- [ ] Type the right values. Tap "Test Connection". Footer says "Connected as <email>".
- [ ] Submit with wrong values. The form stays open and shows the message.
- [ ] Submit with right values. Go back. The root Status row and the URL under Server Settings refresh.
- [ ] After saving a new server in Server Settings, Home reloads from the new server.

## Settings: Homepage Settings

- [ ] Rows: On Deck, Latest Chapters, Keep Reading, Nearly Finished, Recently Added Series, Recently Updated Series, Genres, Collections.
- [ ] Each section but Latest Chapters, Genres and Collections offers Regular, Large, Hero, Hidden.
- [ ] Latest Chapters, Genres and Collections are on/off switches.
- [ ] Change a style. Go to Discover. The section changes right away.
- [ ] Set a section to Hidden. It leaves Discover.

## Settings: Content Settings

- [ ] "Hide Adult Content" switch and "Genres To Hide" list are there.
- [ ] "Libraries" lists my libraries. "Include One-Shots" switch is there.
- [ ] Footer says "Select none to show every library."
- [ ] With one library selected, the Genres section only shows that library's genres.

## Home sections: styles

Try Regular, Large and Hero on each section.

- [ ] On Deck: all three styles load. Items show the book title and book cover.
- [ ] Keep Reading: all three styles load.
- [ ] Nearly Finished: all three styles load. Fewest unread books come first.
- [ ] Recently Added Series: all three styles load.
- [ ] Recently Updated Series: all three styles load.
- [ ] Large cards say "<n> of <n> read".
- [ ] Hero cards show their small icons next to the book and read counts.
- [ ] Genres: tap a genre. Search opens with that genre.

## Home sections: order and scope

- [ ] Keep Reading is ordered by most recently read. Read a series. It moves to the front.
- [ ] In Content Settings, pick one library under "Libraries". Recently Added Series and Recently Updated Series show only that library.
- [ ] Turn "Include One-Shots" off. One-shots leave Recently Added Series and Recently Updated Series.
- [ ] Clear the library choice. All libraries come back.

## Search

- [ ] Search by text. Tiles show cover, title and rating.
- [ ] Filter by Genres: include one. Results match.
- [ ] Filter by Genres: exclude one. Those series are gone.
- [ ] Filters for Tags, Libraries and Collections each work.
- [ ] Include two libraries. Results come from both.
- [ ] "Title (A–Z)" and "Title (Z–A)" give different orders (opposite ends first).
- [ ] "Recently Added", "Recently Updated", "Recently Read" and "Most Chapters" each give an order that differs from the others.
- [ ] Scroll to the bottom. More results load. No duplicate page at the end.
- [ ] Turn off Wi-Fi and search. Empty result, no crash.

## Series details

- [ ] Title, cover and synopsis show.
- [ ] Author, artist and status show.
- [ ] Genres and Tags show as tag groups.
- [ ] Extra info shows language, reading direction, publisher and book counts.
- [ ] Share link opens a sensible page (AniList, MangaDex and so on).
- [ ] An adult series is marked with a higher content rating.

## Chapters and pages

- [ ] A chapter named like `Ch.245` shows as chapter 245 once. No doubled "Chapter 245 - Chapter 245".
- [ ] A chapter named like `Vol.13 Ch.074.5` shows as chapter 74.5 with Volume 13.
- [ ] A chapter with a real name (such as `Vol.02 Ch.016 - The Aria`) shows "The Aria" and volume 2.
- [ ] Chapters list in the right order.
- [ ] Open a chapter. Pages load, including a non-jpeg one.

## Reading progress

- [ ] Open a series. Open the progress form. It shows "Current progress" and "Last Read Chapter".
- [ ] Read a chapter in Paperback to the end. In Komga, that book is marked read.
- [ ] In Komga, mark a chapter read. In Paperback, the series shows that progress.
- [ ] In the progress form, pick a chapter and submit. Komga shows read up to it.
- [ ] Tap "Mark Read". Komga shows the whole series read.
- [ ] Tap "Mark Unread". Komga shows the series unread. Current progress says "No chapters read".
- [ ] Pick "No chapters read" and submit. Komga shows the series unread.
- [ ] Stop the server and tap "Mark Read". The form shows an error and stays open.

## Hide Adult Content

- [ ] Turn on "Hide Adult Content". Series with a hidden genre leave On Deck, Keep Reading, Nearly Finished, Recently Added Series and Recently Updated Series.
- [ ] Those series are also gone from search.
- [ ] Adult genres leave the Genres section.
- [ ] Add or remove a genre under "Genres To Hide". The hidden set changes.
- [ ] Turn it off. They all come back.

## Update check

- [ ] Add a series to my Paperback library.
- [ ] Add a new chapter file in Komga. Scan the library in Komga.
- [ ] In Paperback, refresh the library. The new chapter shows up.
- [ ] A series with no new chapter does not show as updated.

## 4.1.0: Server Settings and About

- [ ] Server Settings has an "API Key" row. Paste a Komga API key. Username and Password grey out.
- [ ] With the key set, tap "Test Connection". Footer says "Connected as <email>".
- [ ] Type a wrong key. Footer says "Invalid API key".
- [ ] Clear the key. Username and Password turn back on.
- [ ] Typing an API key doesn't drop the keyboard.
- [ ] Root screen: the "About" section shows "Extension Version" as the current version, and shows "Komga Version".
- [ ] On a Komga older than 1.19 (if I have one), About shows a warning. Skip if not.
- [ ] On a Komga older than 1.20 with a key set, About warns "API keys need Komga 1.20 or later". Skip if not.

## 4.1.0: Homepage and Content settings

- [ ] Section style menus appear and work: each section with a style shows a menu row. Tap it. Regular, Large, Hero and Hidden are in the menu.
- [ ] Pick a style from the menu. Go to Discover. The section changes right away.
- [ ] "Read Lists" group lists my read lists, all off. If none, it says "No read lists".
- [ ] Turn "Hide Adult Content" off. "Genres To Hide" is greyed out.
- [ ] Turn it on. "Genres To Hide" works again.

## 4.1.0: Home sections

- [ ] "Latest Chapters" shows my newest books. Tap one. The chapter opens.
- [ ] Latest Chapters follows my library choice and "Include One-Shots".
- [ ] Keep Reading now puts the series I read last at the front.
- [ ] "Collections" lists my Komga collections. Tap one. Search opens with it included. An ordered collection is in its own order; any other is A to Z.
- [ ] Turn on a read list in Homepage Settings. It shows as its own section, in read-list order.
- [ ] Turn it off. The section leaves Discover.

## 4.1.0: Search

- [ ] Search with text and no sort chosen. The best match comes first ("Best Match" is the first sort).
- [ ] "Best Match" with no text acts like Title (A-Z).
- [ ] Filter by Read Status: Unread, In progress, Read. Each matches Komga. There is no exclude.
- [ ] Filter by Series Status: include one, then exclude one. Results match.
- [ ] Filter by Publishers, Languages and Age Ratings. Include one, then exclude one.
- [ ] Age Ratings: include "None". Series with no age rating show.
- [ ] Type a name in the "Author" box. Results are series by that person.
- [ ] Sort by "Release Date". Newest release first.
- [ ] Sort by "Random". Different order each time. No second page.

## 4.1.0: Title page

- [ ] A series shows a "Publisher" tag. Tap it. Search opens with that publisher.
- [ ] "Creators" lists the authors, each with their roles.
- [ ] Tap a creator. Search opens with the Author box filled.
- [ ] A series in a collection shows an "In <collection>" section with the other series.
- [ ] A series with reading direction Webtoon opens in vertical scroll.

## 4.1.0: Collection sync

Collections sync both ways. Changing them needs an admin account.

- [ ] In Paperback, my Komga collections show up as collections.
- [ ] Add a series to one in Paperback. Komga shows it in that collection.
- [ ] Remove a series in Paperback. Komga drops it.
- [ ] Add a series in Komga. Paperback shows it after a refresh.
- [ ] Remove a series from a collection in Komga. After refreshing, Paperback drops it from that collection.
- [ ] Turn off the server (or Wi-Fi) and refresh collections. Your Paperback collections stay.
- [ ] Try to remove the last series in a collection. It fails: "Komga collections can't be empty".
- [ ] With a non-admin account (if I have one), a change fails: "Changing Komga collections needs an admin account". Skip if not.

## 4.1.0: Update check

- [ ] Edit only a series' metadata in Komga. Refresh my library. It does not show as updated.
- [ ] Add a new chapter file in Komga. Scan. Refresh. The new chapter shows up.

## 4.1.1: Home rows and speed

- [ ] On Deck, Latest Chapters and read-list rows show books again.
- [ ] Pages that used to convert still load.
- [ ] Optional: in Komga, Account settings → Authentication activity shows far fewer password logins after browsing Home.

## 4.1.2: Webtoon covers

- [ ] Webtoon chapters on On Deck, Latest Chapters and read lists show the series cover.

## 4.1.3: Tag and creator ids

- [ ] A series with a tag or genre containing an apostrophe (e.g. 'can't') refreshes without an error; tapping a creator still searches their name.
- [ ] Chapter tiles on On Deck, Latest Chapters and read lists all show the series cover.

## When done

Tell Claude what passed and what failed. The merge into `0.9/stable` waits for your word.
