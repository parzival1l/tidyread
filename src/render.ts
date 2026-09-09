import type { Article } from "./types.js";

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Rough reading time at 220 words per minute. */
export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
}

/**
 * Render the delivery payload.
 *
 * Deliberately no <link rel="canonical">: a canonical tag invites the reader
 * service to resolve back to the original URL and re-parse it, which is the
 * behaviour this whole tool exists to avoid. Attribution instead sits in the
 * visible header, which no parser strips.
 */
export function renderHtml(article: Article): string {
  const minutes = readingMinutes(article.text);
  const credit = [article.siteName, article.byline].filter(Boolean).join(" — ");

  return `<!doctype html>
<html lang="${escape(article.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${escape(article.title)}</title>
${article.byline ? `<meta name="author" content="${escape(article.byline)}">` : ""}
${article.excerpt ? `<meta name="description" content="${escape(article.excerpt)}">` : ""}
<style>
body{max-width:38em;margin:0 auto;padding:1.5rem;
 font:1rem/1.6 Georgia,"Iowan Old Style",serif;color:#111}
img{max-width:100%;height:auto;display:block;margin:1.4em auto}
figcaption,.tidyread-credit{font-size:.85em;color:#555}
pre{white-space:pre-wrap;word-wrap:break-word;overflow-x:auto;
 background:#f6f6f6;padding:.8em;border-radius:4px;font-size:.85em}
code{font-family:ui-monospace,Menlo,Consolas,monospace}
blockquote{margin:1.2em 0;padding-left:1em;border-left:3px solid #ccc;color:#444}
table{border-collapse:collapse;width:100%;font-size:.9em}
td,th{border:1px solid #ddd;padding:.4em}
h1{font-size:1.7em;line-height:1.25}
.tidyread-credit{margin:0 0 2em;padding-bottom:1em;border-bottom:1px solid #eee}
</style>
</head>
<body>
<article>
<h1>${escape(article.title)}</h1>
<p class="tidyread-credit">
${credit ? `${escape(credit)} · ` : ""}${minutes} min read<br>
Original: <a href="${escape(article.sourceUrl)}">${escape(article.sourceUrl)}</a>
</p>
${article.html}
</article>
</body>
</html>
`;
}
