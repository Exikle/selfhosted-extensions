# Komga phone test

You need: an iPhone with Paperback 0.9, your Komga server, and this workstation on the same network.

`npm run test` exits 0 even when tests fail, so read its summary line.

## Setup

1. On the phone, remove the old Komga extension first.
2. On the workstation, run `npm run dev` in `~/selfhosted-extensions`.
3. Read the port from the output.
4. Find the workstation's LAN IP with `hostname -I` (or `ip -4 addr`).
5. In Paperback, add `http://<LAN IP>:<port>` as a repository.
6. Install Komga (version 4.0.0) from that repository.
7. Open the Komga settings. Check whether the server URL and login came across.

## Install

- [ ] The old Komga is gone before I install.
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

- [ ] Rows: On Deck, Keep Reading, Nearly Finished, Recently Added Series, Recently Updated Series, Genres.
- [ ] Each section but Genres offers Regular, Large, Hero, Hidden.
- [ ] Genres is an on/off switch.
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
- [ ] Hero cards show their small icons next to the book and read counts. (The "book.pages" icon on On Deck may be blank on iOS older than 17. That is fine.)
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

## When done

Tell Claude what passed and what failed. The merge into `0.9/stable` waits for your word.
