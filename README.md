# EMABISZ USA 2026 lyrics

Hungarian (and often English) CCM lyrics for the tour, plus an offline browser
tool that turns a setlist into ProPresenter-ready text files.

Nothing is uploaded. Open `index.html` locally, choose this folder, arrange the
set, and download a ZIP.

## Layout

```text
index.html          Offline setlist builder
plaintext/          Canonical songs (edit these)
setlists/           One file per city / service
tests/run.mjs       Optional parser tests (Node)
```

Each song lives once under `plaintext/`. Setlists only name those files; they do
not copy lyrics.

## Editing songs

Edit `plaintext/<song-id>.txt`. Keep this shape:

1. Title: Hungarian, or `Hungarian / English`
2. A line of hyphens (`--------` or longer)
3. Hungarian sections
4. Optionally another hyphen line, then English sections

Sections start with a label such as `Verse 1`, `Chorus`, `Pre-Chorus`, `Bridge`,
or `Ending` (a trailing colon is fine). Repeat marks like `/: … :/` and `3x`
stay as written.

## Editing setlists

Each file in `setlists/` is an ordered list of canonical filenames:

```text
az-ur-igeje-szol.txt
tudjatok-meg-hogy-az-ur-az-isten.txt
```

- Line order is the set order.
- Blank lines and `#` comments are ignored.
- The same song may appear more than once.
- Every name must match a file in `plaintext/`.

Current sets: Chicago, Cleveland, Detroit, NY Friday, NY Sat AM, NY Sat PM,
NY Sunday, Toronto.

## Using the builder

1. Open `index.html` in a browser (double-click is enough; no server or Bun).
2. Choose **this repository folder**, or drop it onto the page.
3. Pick a setlist, then a song.
4. Check **HU ↔ EN mapping** if a bilingual song paired the wrong sections.
5. Edit the **roadmap**: reorder, repeat, remove, or switch a step to EN.
6. Confirm the **preview** — that is what gets exported.
7. **Download ZIP**.

Roadmaps and mapping fixes exist only in this browser session. Reloading the
page or re-choosing the folder resets them. Source files are never rewritten.

The ZIP looks like:

```text
toronto/
  01-az-urnak-szoljon-uj-dal-sing-a-new-song.txt
  02-mert-van-egy-uj-nev-new-name-written-down-in-glory.txt
  …
```

Each file is flattened to the current roadmap: title, then one section per
paragraph (blank line = ProPresenter slide). Only the chosen language per step
is included.

In ProPresenter, import the extracted `.txt` files (paragraph breaks as slide
breaks) into a new playlist.

## Tests

Optional, for checking the parser after lyric/format changes:

```bash
node tests/run.mjs
```
