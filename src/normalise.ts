import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";

/**
 * Final gate before the body leaves this module. The article is third-party
 * HTML that we serve on a public URL, so structure passes and active content
 * does not: no event handlers, no javascript: URLs, no unknown tags.
 */
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code", "dd",
    "del", "dfn", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3",
    "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p",
    "pre", "q", "s", "samp", "small", "strong", "sub", "sup", "table", "tbody",
    "td", "tfoot", "th", "thead", "tr", "u", "ul", "div", "span",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

/** Attributes lazy-loading scripts hide the real image URL behind. */
const LAZY_SRC = [
  "data-src",
  "data-original",
  "data-lazy-src",
  "data-actual-src",
  "data-hi-res-src",
];
const LAZY_SRCSET = ["data-srcset", "data-lazy-srcset"];

/** Wrappers that carry no meaning once styling is gone. */
const UNWRAP = ["div", "span", "section", "article"];

function absolute(value: string, base: string): string | null {
  try {
    return new URL(value.trim(), base).href;
  } catch {
    return null;
  }
}

/** Pick the largest candidate from a srcset, so e-ink gets a sharp image. */
function widestFromSrcset(srcset: string, base: string): string | null {
  let best: { url: string; width: number } | null = null;
  for (const part of srcset.split(",")) {
    const [rawUrl, descriptor] = part.trim().split(/\s+/, 2);
    if (!rawUrl) continue;
    const url = absolute(rawUrl, base);
    if (!url) continue;
    const width = descriptor?.endsWith("w")
      ? Number.parseInt(descriptor, 10) || 0
      : 0;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url ?? null;
}

/**
 * Repair a Readability body so a downstream parser reads it correctly.
 *
 * Images keep their original absolute URLs rather than being rehosted, so the
 * artifact stays text-only and the publisher still serves its own assets.
 */
export function normalise(
  bodyHtml: string,
  baseUrl: string,
): { html: string; images: string[] } {
  // linkedom silently drops content passed as a bare `<body>` fragment, so
  // parse a real document and fill a container element instead.
  const { document } = parseHTML(
    "<!DOCTYPE html><html><body></body></html>",
  ) as unknown as { document: Document };
  const root = document.createElement("div");
  root.innerHTML = bodyHtml;

  // Drop anything that is chrome, tracking, or noise.
  root
    .querySelectorAll(
      "script,style,noscript,iframe,form,button,svg,link,meta," +
        "[role=navigation],[role=banner],[role=complementary],[aria-hidden=true]",
    )
    .forEach((el) => el.remove());

  const images: string[] = [];
  for (const img of Array.from(root.querySelectorAll("img"))) {
    let src: string | null = null;

    for (const attr of LAZY_SRC) {
      const value = img.getAttribute(attr);
      if (value) {
        src = absolute(value, baseUrl);
        if (src) break;
      }
    }
    for (const attr of LAZY_SRCSET) {
      if (src) break;
      const value = img.getAttribute(attr);
      if (value) src = widestFromSrcset(value, baseUrl);
    }
    if (!src) {
      const srcset = img.getAttribute("srcset");
      if (srcset) src = widestFromSrcset(srcset, baseUrl);
    }
    if (!src) {
      const raw = img.getAttribute("src");
      if (raw && !raw.startsWith("data:")) src = absolute(raw, baseUrl);
    }

    if (src && !/^https?:/i.test(src)) src = null;

    const width = Number.parseInt(img.getAttribute("width") ?? "0", 10);
    const height = Number.parseInt(img.getAttribute("height") ?? "0", 10);
    const isPixel = width > 0 && width <= 2 && height > 0 && height <= 2;

    if (!src || isPixel) {
      img.remove();
      continue;
    }

    const alt = img.getAttribute("alt")?.trim() ?? "";
    for (const attr of Array.from(img.attributes)) {
      img.removeAttribute(attr.name);
    }
    img.setAttribute("src", src);
    img.setAttribute("alt", alt);
    images.push(src);
  }

  // Make links absolute so they still work off the original domain.
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    const href = absolute(a.getAttribute("href") ?? "", baseUrl);
    if (href) a.setAttribute("href", href);
    else a.removeAttribute("href");
  }

  // Readability often leaves code as a bare <pre> or a <code> soup. Parsers
  // reflow that into prose unless the <pre><code> pair is explicit.
  for (const pre of Array.from(root.querySelectorAll("pre"))) {
    if (!pre.querySelector("code")) {
      const code = document.createElement("code");
      code.textContent = pre.textContent ?? "";
      pre.textContent = "";
      pre.appendChild(code);
    }
  }

  // Collapse wrappers that hold a single child and add no structure.
  for (const el of Array.from(root.querySelectorAll(UNWRAP.join(",")))) {
    const kept = Array.from(el.childNodes).filter(
      (n) => n.nodeType !== 3 || (n.textContent ?? "").trim() !== "",
    );
    if (kept.length === 1 && kept[0].nodeType === 1) {
      el.replaceWith(kept[0]);
    }
  }

  // Remove blocks left empty by the passes above.
  for (const el of Array.from(root.querySelectorAll("p,div,li,h1,h2,h3,h4"))) {
    const hasMedia = el.querySelector("img,pre,code,table");
    if (!hasMedia && !(el.textContent ?? "").trim()) el.remove();
  }

  const clean = sanitizeHtml(root.innerHTML, SANITIZE).trim();
  return { html: clean, images };
}
