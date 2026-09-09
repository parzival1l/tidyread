import test from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../dist/normalise.js";
import { renderHtml, readingMinutes } from "../dist/render.js";
import { serveOnce } from "../dist/serve.js";

const BASE = "https://example.com/posts/article";

test("normalise resolves lazy-loaded images to absolute URLs", () => {
  const { html, images } = normalise(
    `<p>hi</p><img data-src="/img/fig.png" alt="fig">`,
    BASE,
  );
  assert.equal(images.length, 1);
  assert.equal(images[0], "https://example.com/img/fig.png");
  assert.match(html, /src="https:\/\/example\.com\/img\/fig\.png"/);
});

test("normalise picks the widest srcset candidate", () => {
  const { images } = normalise(
    `<img srcset="/small.jpg 400w, /big.jpg 1600w, /mid.jpg 800w">`,
    BASE,
  );
  assert.deepEqual(images, ["https://example.com/big.jpg"]);
});

test("normalise drops tracking pixels and keeps the article", () => {
  const { html, images } = normalise(
    `<p>text</p><img src="/pixel.gif" width="1" height="1">`,
    BASE,
  );
  assert.equal(images.length, 0);
  assert.match(html, /<p>text<\/p>/);
});

test("normalise wraps bare <pre> in <code>", () => {
  const { html } = normalise(`<pre>const x = 1;</pre>`, BASE);
  assert.match(html, /<pre><code>const x = 1;<\/code><\/pre>/);
});

test("normalise makes relative links absolute", () => {
  const { html } = normalise(`<p><a href="../other">link</a></p>`, BASE);
  assert.match(html, /href="https:\/\/example\.com\/other"/);
});

test("normalise strips inline event handlers", () => {
  const { html } = normalise(
    `<p onclick="steal()">text</p><img src="/a.png" onerror="steal()">`,
    BASE,
  );
  assert.doesNotMatch(html, /onclick|onerror/);
  assert.match(html, /<p>text<\/p>/);
});

test("normalise drops javascript: links but keeps their text", () => {
  const { html } = normalise(
    `<p><a href="javascript:alert(1)">click</a> and <a href="/ok">fine</a></p>`,
    BASE,
  );
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /click/);
  assert.match(html, /href="https:\/\/example\.com\/ok"/);
});

test("normalise removes script tags and unknown elements", () => {
  const { html } = normalise(
    `<p>a</p><script>steal()</script><object data="x"></object>`,
    BASE,
  );
  assert.doesNotMatch(html, /script|object|steal/);
});

test("normalise keeps non-http image URLs out of the download list", () => {
  const { images } = normalise(
    `<img src="javascript:alert(1)"><img src="/real.png">`,
    BASE,
  );
  assert.deepEqual(images, ["https://example.com/real.png"]);
});

const article = {
  sourceUrl: BASE,
  title: 'A "Great" <Article>',
  byline: "Jane Doe",
  siteName: "Example",
  excerpt: null,
  html: "<p>body</p>",
  text: "word ".repeat(440).trim(),
  images: [],
  lang: "en",
};

test("renderHtml escapes metadata and keeps attribution visible", () => {
  const html = renderHtml(article);
  assert.match(html, /A &quot;Great&quot; &lt;Article&gt;/);
  assert.match(html, /Example — Jane Doe/);
  assert.match(html, /Original: <a href="https:\/\/example\.com\/posts\/article"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test("readingMinutes rounds at 220 wpm", () => {
  assert.equal(readingMinutes(article.text), 2);
  assert.equal(readingMinutes("one two three"), 1);
});

test("serveOnce serves the payload at its token path and 404s elsewhere", async () => {
  const hosted = await serveOnce("<html><body>payload</body></html>");
  try {
    const good = await fetch(`http://127.0.0.1:${hosted.port}${hosted.path}`);
    assert.equal(good.status, 200);
    assert.match(await good.text(), /payload/);
    assert.equal(good.headers.get("x-robots-tag"), "noindex, nofollow");

    const bad = await fetch(`http://127.0.0.1:${hosted.port}/nope`);
    assert.equal(bad.status, 404);
  } finally {
    await hosted.close();
  }
});
