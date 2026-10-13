# web-slides

A Claude Code skill: a runtime shell for single-file HTML slide decks with a presenter view.

You (or Claude) write the slides; the shell adds

- a **presenter window** — current slide, next slide, speaker notes, timer and clock — that
  stays in sync with the audience window in both directions,
- keyboard / touch navigation and auto-scaling of a fixed 1280×720 stage,
- an overview grid, a notes panel, fullscreen, and one-slide-per-page printing (PDF).

The result is one self-contained `.html` file that opens by double-click.

## Install

```sh
git clone https://github.com/hongxin001/web-slides.git ~/.claude/skills/web-slides
```

Restart Claude Code; the skill is picked up automatically. Update with `git pull`.
To share it with a team instead, put the folder at `.claude/skills/web-slides/` inside a project repository.

## Use

Ask Claude for HTML slides with a presenter view / speaker notes, or run the build yourself:

```sh
python3 -I scripts/build.py <deck dir> <out.html> [--title T] [--lang zh-CN]
```

```
deck/
  slides.html   one <section class="slide"> per slide            (required)
  deck.css      the deck's own styles                            (optional)
  head.html     extra <head> tags, e.g. web fonts                (optional)
  notes.json    JSON array of strings, one per slide             (optional)
  media/        images, referenced as <img data-i="file.png">    (optional)
```

| Key | Action |
|---|---|
| `←` `→` `Space` | navigate |
| `P` | presenter view in a separate window |
| `N` | notes panel in the same window |
| `O` | overview |
| `F` | fullscreen |

Speaker notes are embedded in the output file: anyone who has the file can read them.

See [SKILL.md](SKILL.md) for the slide/shell contract and how the presenter view works.

## Requirements

- Python 3 (standard library only) to build.
- Node ≥ 22 and Chrome only for the behaviour test: `node scripts/sync_test.mjs /abs/path/out.html`.

## License

MIT
