import { spawnSync } from "node:child_process";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * External binaries tidyread depends on.
 *
 * A system install on PATH always wins, so power users keep control. When a
 * binary is missing, tidyread falls back to a bundled or downloaded copy so
 * `npm install -g tidyread` is the only step anyone has to take.
 */

const CACHE_DIR = join(homedir(), ".cache", "tidyread", "bin");

function onPath(name: string): string | null {
  const found = spawnSync("which", [name], { encoding: "utf8" });
  const path = found.status === 0 ? found.stdout.trim() : "";
  return path || null;
}

/**
 * cloudflared: PATH first, then the copy the `cloudflared` npm package
 * downloads from Cloudflare's GitHub releases at install time.
 */
export async function cloudflaredBin(): Promise<string> {
  const system = onPath("cloudflared");
  if (system) return system;

  const pkg = await import("cloudflared");
  if (!existsSync(pkg.bin)) {
    process.stderr.write("  setup        downloading cloudflared (one time)\n");
    await pkg.install(pkg.bin);
  }
  return pkg.bin;
}

/** Asset names in pgaskin/kepubify releases, keyed by platform-arch. */
const KEPUBIFY_ASSETS: Record<string, string> = {
  "darwin-arm64": "kepubify-darwin-arm64",
  "darwin-x64": "kepubify-darwin-64bit",
  "linux-arm64": "kepubify-linux-arm64",
  "linux-x64": "kepubify-linux-64bit",
  "win32-x64": "kepubify-windows-64bit.exe",
};

/**
 * kepubify: PATH first, then a cached copy downloaded once from the official
 * pgaskin/kepubify GitHub releases. Returns null when the platform has no
 * published binary — the caller skips KEPUB output rather than failing.
 */
export async function kepubifyBin(): Promise<string | null> {
  const system = onPath("kepubify");
  if (system) return system;

  const asset = KEPUBIFY_ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) return null;

  const cached = join(CACHE_DIR, asset);
  if (existsSync(cached)) return cached;

  const url = `https://github.com/pgaskin/kepubify/releases/latest/download/${asset}`;
  process.stderr.write("  setup        downloading kepubify (one time)\n");
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    const partial = `${cached}.download`;
    await writeFile(partial, bytes);
    await chmod(partial, 0o755);
    await rename(partial, cached);
    return cached;
  } catch {
    return null;
  }
}
