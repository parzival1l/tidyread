# tidyread

Clean a web article once, then hand it to Instapaper pre-chewed — and build a
Kobo-ready EPUB while you're at it.

## Why

Instapaper's parser re-fetches every URL you save and often mangles the page:
lazy-loaded images vanish, code blocks reflow into prose, figures lose their
captions. tidyread extracts and repairs the article locally, serves the clean
copy on a short-lived public URL, and saves *that* to Instapaper. Instapaper's
parser reads a page with nothing left to get wrong. The URL dies when the
process exits.

It also writes an EPUB (images embedded, e-ink stylesheet) and a Kobo-native
KEPUB, so you can skip Instapaper entirely and sideload.

## Install

```sh
npm install -g tidyread
brew install cloudflared   # short-lived tunnel for the Instapaper handoff
brew install kepubify      # optional: Kobo-native output
```

## Use

```sh
# clean + save to Instapaper via your logged-in browser
tidyread <url> --open

# clean + save with Instapaper credentials (Simple API)
INSTAPAPER_USERNAME=you INSTAPAPER_PASSWORD=pw tidyread <url>

# build files only, no tunnel, nothing leaves the machine
tidyread <url> --no-send

# choose the output directory (default: ~/Kobo/inbox)
tidyread <url> -o ~/Desktop
```

Outputs per article: `<slug>.html`, `<slug>.epub`, `<slug>.kepub.epub`.

## How it works

1. **extract** — [defuddle](https://github.com/kepano/defuddle) finds the
   article; @mozilla/readability catches pages defuddle can't read.
2. **normalise** — real image URLs recovered from lazy-load attributes and
   srcset, links made absolute, tracking pixels dropped, bare `<pre>` wrapped
   in `<code>`, empty wrappers collapsed.
3. **serve** — the cleaned HTML sits on localhost behind a 128-bit random path.
4. **tunnel** — `cloudflared` quick tunnel exposes it, no account needed.
5. **deliver** — the tunnel URL goes to Instapaper (Simple API or browser).
   After Instapaper fetches, the tunnel closes and the URL stops resolving.
6. **epub** — images downloaded and embedded, e-ink stylesheet applied,
   kepubify converts for Kobo page numbers and reading stats.

## Boundaries

- The public copy is one article, behind an unguessable URL, alive for
  seconds, for your own reading. tidyread refuses to be a mirror: the server
  dies with the process.
- Article text is never rewritten. Attribution and the original link sit at
  the top of every artifact.

## License

MIT
