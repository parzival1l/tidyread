#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { extract } from "./extract.js";
import { renderHtml, readingMinutes } from "./render.js";
import { serveOnce } from "./serve.js";
import { openTunnel } from "./tunnel.js";
import { buildEpub, toKepub } from "./epub.js";
import { addByApi, addByBrowser, credentialsFromEnv } from "./instapaper.js";

const DEFAULT_OUT = join(homedir(), "Kobo", "inbox");
const FETCH_WAIT_MS = 90_000;

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "article"
  );
}

function log(step: string, detail = ""): void {
  process.stderr.write(`  ${step.padEnd(12)} ${detail}\n`);
}

const program = new Command();

program
  .name("tidyread")
  .description(
    "Clean an article once, then hand it to Instapaper pre-chewed " +
      "and build a Kobo-ready EPUB.",
  )
  .version("0.1.0");

program
  .argument("<url>", "article URL")
  .option("-o, --out <dir>", "output directory", DEFAULT_OUT)
  .option("--no-epub", "skip the EPUB and KEPUB build")
  .option("--no-send", "build files only, never open a tunnel")
  .option("--open", "save via the browser instead of the Simple API")
  .option("--keep-open", "leave the tunnel up until you press Ctrl-C")
  .action(async (url: string, opts) => {
    const outDir = resolve(opts.out);
    await mkdir(outDir, { recursive: true });

    log("fetching", url);
    const article = await extract(url);
    const name = slug(article.title);
    log(
      "extracted",
      `"${article.title}" · ${readingMinutes(article.text)} min · ` +
        `${article.images.length} images`,
    );

    const html = renderHtml(article);
    const htmlPath = join(outDir, `${name}.html`);
    await writeFile(htmlPath, html, "utf8");
    log("wrote", htmlPath);

    if (opts.epub) {
      const epubPath = await buildEpub(article, join(outDir, `${name}.epub`));
      log("wrote", epubPath);
      const kepubPath = await toKepub(epubPath);
      if (kepubPath) log("wrote", kepubPath);
      else log("skipped", "kepubify not found — install with: brew install kepubify");
    }

    if (!opts.send) return;

    const hosted = await serveOnce(html);
    const tunnel = await openTunnel(hosted.port);
    const publicUrl = `${tunnel.origin}${hosted.path}`;

    const teardown = async () => {
      await tunnel.close();
      await hosted.close();
    };
    process.once("SIGINT", async () => {
      await teardown();
      process.exit(130);
    });

    try {
      log("tunnel", publicUrl);

      const creds = credentialsFromEnv();
      if (opts.open || !creds) {
        addByBrowser(publicUrl);
        log("browser", "opened Instapaper save page — confirm it in the tab");
      } else {
        await addByApi(publicUrl, article.title, creds);
        log("instapaper", `saved as "${article.title}"`);
      }

      const timeout = new Promise<null>((r) =>
        setTimeout(() => r(null), FETCH_WAIT_MS),
      );
      const hit = await Promise.race([hosted.fetched, timeout]);

      if (hit) log("fetched", `by ${hit.userAgent.slice(0, 60)}`);
      else
        log(
          "warning",
          `nothing fetched in ${FETCH_WAIT_MS / 1000}s — the save may not have landed`,
        );

      if (opts.keepOpen) {
        log("holding", "tunnel open — press Ctrl-C to close");
        await new Promise(() => {});
      }
    } finally {
      if (!opts.keepOpen) {
        await teardown();
        log("closed", "tunnel down, URL no longer resolves");
      }
    }
  });

program.parseAsync(process.argv).catch((err: Error) => {
  process.stderr.write(`\ntidyread: ${err.message}\n`);
  process.exit(1);
});
