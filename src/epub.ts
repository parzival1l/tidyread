import JSZip from "jszip";
import { parseHTML } from "linkedom";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { kepubifyBin } from "./bins.js";
import type { Article } from "./types.js";
import { readingMinutes } from "./render.js";

/** Typography tuned for a small, slow, greyscale screen. */
const STYLESHEET = `
body { margin: 0 1.1em; line-height: 1.5; text-align: justify;
       hyphens: auto; -webkit-hyphens: auto; }
h1 { font-size: 1.5em; line-height: 1.25; text-align: left; margin: 1em 0 .2em; }
h2 { font-size: 1.2em; text-align: left; page-break-after: avoid; }
h3 { font-size: 1.05em; text-align: left; page-break-after: avoid; }
p { margin: 0 0 .7em; widows: 2; orphans: 2; }
img { max-width: 100%; height: auto; page-break-inside: avoid; margin: 1em auto; }
figcaption, .credit { font-size: .8em; font-style: italic; text-align: center; }
pre { white-space: pre-wrap; word-wrap: break-word; font-size: .75em;
      background: #f2f2f2; padding: .5em; text-align: left; }
code { font-family: monospace; }
blockquote { margin: 1em 1.2em; font-style: italic; }
table { border-collapse: collapse; width: 100%; font-size: .8em; }
td, th { border: 1px solid #999; padding: .3em; }
.credit { margin-bottom: 2em; }
`;

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

interface Asset {
  id: string;
  href: string;
  mime: string;
  bytes: Uint8Array;
}

/**
 * Download body images so the book reads offline.
 *
 * Anything that fails is dropped rather than fatal: a missing figure should
 * not cost you the article.
 */
async function collectImages(
  urls: string[],
): Promise<{ assets: Asset[]; map: Map<string, string> }> {
  const assets: Asset[] = [];
  const map = new Map<string, string>();

  await Promise.all(
    [...new Set(urls)].map(async (url, index) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const type = (res.headers.get("content-type") ?? "").split(";")[0];
        let ext =
          extname(new URL(url).pathname).toLowerCase() ||
          Object.entries(MIME).find(([, m]) => m === type)?.[0] ||
          ".jpg";
        if (!MIME[ext]) ext = ".jpg";
        const href = `images/img${index}${ext}`;
        assets.push({ id: `img${index}`, href, mime: MIME[ext], bytes });
        map.set(url, href);
      } catch {
        /* skip unreachable image */
      }
    }),
  );

  return { assets, map };
}

/** Point <img> at the copies bundled in the book; drop the rest. */
function rewriteImages(html: string, map: Map<string, string>): string {
  const { document } = parseHTML(
    "<!DOCTYPE html><html><body></body></html>",
  ) as unknown as { document: Document };
  const root = document.createElement("div");
  root.innerHTML = html;
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const local = map.get(img.getAttribute("src") ?? "");
    if (local) img.setAttribute("src", local);
    else img.remove();
  }
  return root.innerHTML;
}

/** Write a minimal, valid EPUB 3 for the article. */
export async function buildEpub(
  article: Article,
  outPath: string,
): Promise<string> {
  const { assets, map } = await collectImages(article.images);
  const body = rewriteImages(article.html, map);
  const uuid = randomUUID();
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const credit = [article.siteName, article.byline].filter(Boolean).join(" — ");

  const chapter = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escape(article.lang)}">
<head><meta charset="utf-8"/><title>${escape(article.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<section epub:type="chapter">
<h1>${escape(article.title)}</h1>
<p class="credit">${credit ? `${escape(credit)} · ` : ""}${readingMinutes(article.text)} min read<br/>
<a href="${escape(article.sourceUrl)}">${escape(article.sourceUrl)}</a></p>
${body}
</section>
</body></html>`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escape(article.lang)}">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1>
<ol><li><a href="chapter.xhtml">${escape(article.title)}</a></li></ol>
</nav></body></html>`;

  const manifest = assets
    .map(
      (a) =>
        `<item id="${a.id}" href="${a.href}" media-type="${a.mime}"/>`,
    )
    .join("\n    ");

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escape(article.title)}</dc:title>
    <dc:language>${escape(article.lang)}</dc:language>
    <dc:creator>${escape(article.byline ?? article.siteName ?? "Unknown")}</dc:creator>
    <dc:source>${escape(article.sourceUrl)}</dc:source>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifest}
  </manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`;

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file("OEBPS/content.opf", opf);
  zip.file("OEBPS/nav.xhtml", nav);
  zip.file("OEBPS/chapter.xhtml", chapter);
  zip.file("OEBPS/style.css", STYLESHEET);
  for (const asset of assets) zip.file(`OEBPS/${asset.href}`, asset.bytes);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  await writeFile(outPath, buffer);
  return outPath;
}

/** Convert to Kobo's EPUB dialect, for real page numbers and reading stats. */
export async function toKepub(epubPath: string): Promise<string | null> {
  const bin = await kepubifyBin();
  if (!bin) return null;
  const outPath = epubPath.replace(/\.epub$/, ".kepub.epub");
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn(bin, ["-o", outPath, epubPath], { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
  return ok ? outPath : null;
}

export { basename };
