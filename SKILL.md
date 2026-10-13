---
name: web-slides
description: Runtime shell for single-file HTML slide decks ("web slides") with a presenter view — a separate presenter window (current + next slide, speaker notes, timer, clock) kept in sync with the audience window — plus keyboard/touch navigation, auto-scaling, overview grid, notes panel, fullscreen and print-to-PDF. Use when building or fixing HTML slides that need 演讲者视图 / 演讲备注 / presenter mode / speaker notes, or when wrapping existing slide markup into a presentable single file. It supplies the shell only: slide content, visual design and source conversion are up to the task at hand.
---

# Web slides shell

`assets/shell.html` is a deck-agnostic runtime. You provide slide markup (and whatever CSS
styles it); the shell makes it presentable. Do not re-implement navigation or the presenter
view per deck — fill the shell.

## Filling the shell

```
python3 -I scripts/build.py <deck dir> <out.html> [--title T] [--lang zh-CN]
```

```
deck/
  slides.html   one <section class="slide ..."> per slide          (required)
  deck.css      the deck's own styles                              (optional)
  head.html     extra <head> tags, e.g. web-font <link>s           (optional)
  notes.json    JSON array of strings, one per slide ("" = none)   (optional)
  media/        images, referenced as <img data-i="file.png">      (optional)
```

The output is one self-contained `.html` (images inlined as data URIs, each file once). The
build fails on missing media or when `notes.json` and the slide count disagree. The same
placeholders can be filled by hand: `__LANG__`, `__TITLE__`, `<!--__HEAD__-->`,
`/*__DECK_CSS__*/`, `<!--__SLIDES__-->`, `/*__IMG__*/{}`, `/*__NOTES__*/[]`.

## Contract between slides and shell

- Every slide is `<section class="slide">` on a fixed **1280×720** stage that the shell scales
  to the window; size slide content in `px`. The shell sets `.slide{display:none}` and
  `.slide.active{display:flex; flex-direction:column}` — deck CSS may restyle but must not
  break that show/hide.
- The shell adds `.active` to the current slide and, in the presenter view, `.next` to the
  following one. Entrance animations should key off `.slide.active`; the shell disables
  animations in overview, presenter view and print.
- `<span class="pg"></span>` inside a slide is filled with its page number.
- `<img data-i="file.png">` (no `src`) is resolved from `media/` at build time.
- Notes are plain text; `\n\n` separates paragraphs. They ship inside the file — anyone who has
  it can read them with `N` or `P`. Omit `notes.json` if they must stay private.
- Shell chrome reads three CSS variables, with built-in defaults: `--orange` (accent),
  `--peach` (light accent), `--sans` (UI font). Define them in `deck.css` to match the deck.
- `<html lang>` (`--lang`) only switches the fallback toast between English and Chinese.

## What the shell provides

| Key | Action |
|---|---|
| `←` `→` `Space` `PgUp/PgDn` `Home` `End`, swipe | navigate |
| `P` | presenter view in a separate window |
| `N` | notes panel in the same window (the audience sees it if projected) |
| `O` / `Esc` | overview grid; click a slide to jump |
| `F` | fullscreen |
| presenter window: `T` pause timer, `R` reset, `+` `-` notes size | |

`#7` in the URL opens slide 7; `?speaker` opens the presenter layout directly. Browser print
gives one slide per page.

Presenting: displays on **extend**, not mirror; press `P`, keep the presenter window on the
laptop, drag the main window to the projector, press `F`. Navigate from either window.

## How the presenter view works (keep these when changing the shell)

- It is the same file opened with `?speaker`. Both windows hold every slide and exchange only
  the slide index through `postMessage` (opener ↔ pop-up). That works from `file://` and inside
  sandboxed iframes, where `BroadcastChannel` and `localStorage` do not.
- `go(n, quiet)`: an index received from the peer is applied with `quiet = true`, so it is not
  echoed back. The audience window re-adopts the presenter window from `event.source`, so a
  presenter-window reload keeps the link.
- Layout is CSS only: `body.speaker` re-positions the existing `.active` and `.next` slides
  with `position:fixed` + `transform:scale()`, driven by CSS variables that `fit()` computes
  from the window size. The notes panel is the same element as the `N` panel.
- If `window.open` fails — pop-up blocker, or a host iframe sandboxed without `allow-popups`
  (where `alert()` is blocked too) — `P` falls back to the presenter layout in the same window
  and shows a toast; `P` or `Esc` leaves it. When `P` does nothing on a hosting site, check the
  embedding iframe's `sandbox` attribute.
- Letter shortcuts read `e.code` when `e.key` is not a letter: with a Chinese/Japanese IME
  active, `e.key` is `"Process"`.

## Testing the shell

`node scripts/sync_test.mjs /abs/path/out.html` (Node ≥ 22, Chrome) drives real windows through
DevTools: presenter pop-up, two-way sync, IME key, reuse of the window, timer pause — top-level
and inside an `allow-popups` iframe — and the same-window fallback in a locked-down iframe.
It must end with `all checks passed`. Run it after any change to `shell.html`.
