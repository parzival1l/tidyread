import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { Defuddle } from "defuddle/node";
import { normalise } from "./normalise.js";
import type { Article } from "./types.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/** Below this many characters, an extraction is judged a failure. */
const MIN_TEXT = 500;

/** Download a page as text, following redirects. */
export async function fetchPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return { html: await res.text(), finalUrl: res.url || url };
}

interface Extraction {
  content: string;
  title: string | null;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  lang: string | null;
}

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

/**
 * Primary extractor. Defuddle keeps structure Readability flattens:
 * code blocks, footnotes, math, and tables survive it.
 */
async function byDefuddle(html: string, url: string): Promise<Extraction | null> {
  try {
    const result = await Defuddle(html, url);
    if (!result?.content || textLength(result.content) < MIN_TEXT) return null;
    return {
      content: result.content,
      title: result.title || null,
      byline: result.author || null,
      siteName: result.site || null,
      excerpt: result.description || null,
      lang: result.language || null,
    };
  } catch {
    return null;
  }
}

/** Fallback extractor for pages Defuddle cannot read. */
function byReadability(html: string, url: string): Extraction | null {
  const { document } = parseHTML(html) as unknown as { document: Document };
  const lang = document.documentElement?.getAttribute("lang")?.trim() || null;
  const parsed = new Readability(document, {
    charThreshold: 250,
    keepClasses: false,
  }).parse();
  if (!parsed?.content || textLength(parsed.content) < MIN_TEXT) return null;
  return {
    content: parsed.content,
    title: parsed.title || null,
    byline: parsed.byline || null,
    siteName: parsed.siteName || null,
    excerpt: parsed.excerpt || null,
    lang,
  };
}

/**
 * Turn a URL into a clean Article.
 *
 * Defuddle extracts; Readability catches what it misses; normalise repairs
 * what any extractor leaves behind (lazy images, relative URLs, bare <pre>).
 */
export async function extract(url: string): Promise<Article> {
  const { html, finalUrl } = await fetchPage(url);

  const picked =
    (await byDefuddle(html, finalUrl)) ?? byReadability(html, finalUrl);
  if (!picked) {
    throw new Error(
      `could not find an article body at ${finalUrl}. ` +
        `The page may render its content with JavaScript.`,
    );
  }

  const { html: body, images } = normalise(picked.content, finalUrl);
  const text = picked.content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    sourceUrl: finalUrl,
    title: (picked.title || "Untitled").trim(),
    byline: picked.byline?.trim() || null,
    siteName: picked.siteName || new URL(finalUrl).hostname,
    excerpt: picked.excerpt?.trim() || null,
    html: body,
    text,
    images,
    lang: (picked.lang || "en").split(/[_-]/)[0] || "en",
  };
}
