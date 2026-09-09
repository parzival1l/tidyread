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

Everything runs on your machine. No account, no server, no telemetry.

## Install

```sh
npm install -g tidyread
```

That's the whole setup. The two helper binaries arrive on their own:
[cloudflared](https://github.com/cloudflare/cloudflared) installs with the
package, and [kepubify](https://github.com/pgaskin/kepubify) downloads once on
first use from its official releases. If you already have either on your PATH,
your copy wins.

Prefer GitHub over the npm registry:

```sh
npm install -g github:parzival1l/tidyread
```

or grab the tarball from the
[latest release](https://github.com/parzival1l/tidyread/releases) and
`npm install -g tidyread-<version>.tgz`.

## Use

```sh
# clean the article, then save it to Instapaper through your browser —
# tidyread never sees your credentials
tidyread <url>

# build files only; nothing leaves the machine
tidyread <url> --no-send

# choose the output directory (default: ~/Kobo/inbox)
tidyread <url> -o ~/Desktop

# pick which browser handles the save
TIDYREAD_BROWSER=Safari tidyread <url>
```

Outputs per article: `<slug>.html`, `<slug>.epub`, `<slug>.kepub.epub`.

The default save flow opens Instapaper's save page in your browser and uses
the session already there. For headless automation only, `--api` uses the
Instapaper Simple API with `INSTAPAPER_USERNAME` and `INSTAPAPER_PASSWORD`
from the environment.

## How it works

1. **extract** — [defuddle](https://github.com/kepano/defuddle) finds the
   article; @mozilla/readability catches pages defuddle can't read.
2. **normalise** — real image URLs recovered from lazy-load attributes and
   srcset, links made absolute, tracking pixels dropped, bare `<pre>` wrapped
   in `<code>`, active content stripped by a sanitizer allowlist.
3. **serve** — the cleaned HTML sits on localhost behind a 128-bit random path.
4. **tunnel** — a `cloudflared` quick tunnel exposes it; no Cloudflare account
   needed.
5. **deliver** — the tunnel URL goes to Instapaper through your browser.
   After Instapaper fetches, the tunnel closes and the URL stops resolving.
6. **epub** — images downloaded and embedded, e-ink stylesheet applied,
   kepubify converts for Kobo page numbers and reading stats.

## Boundaries

- The public copy is one article, behind an unguessable URL, alive for
  seconds, for your own reading. tidyread refuses to be a mirror: the server
  dies with the process.
- Article text is never rewritten. Attribution and the original link sit at
  the top of every artifact.
- Helper binaries come only from their official sources: cloudflared from
  Cloudflare's GitHub releases, kepubify from pgaskin's GitHub releases.

## License

MIT
