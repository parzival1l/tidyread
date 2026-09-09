import { spawn, type ChildProcess } from "node:child_process";
import { cloudflaredBin } from "./bins.js";

export interface Tunnel {
  /** Public https origin, e.g. "https://foo-bar.trycloudflare.com". */
  origin: string;
  close(): Promise<void>;
}

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 30_000;

/**
 * Open a Cloudflare quick tunnel to a local port.
 *
 * Quick tunnels need no account and no login. The address exists only while
 * this process lives, so the payload cannot outlive the run. Cloudflare offers
 * these on a best-effort basis with no SLA, which suits one-off personal use
 * and nothing heavier.
 */
export async function openTunnel(port: number): Promise<Tunnel> {
  const bin = await cloudflaredBin();
  const child: ChildProcess = spawn(
    bin,
    [
      "tunnel",
      "--no-autoupdate",
      "--url",
      `http://127.0.0.1:${port}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("cloudflared did not produce a URL within 30s"));
    }, START_TIMEOUT_MS);

    const scan = (chunk: Buffer) => {
      const match = URL_PATTERN.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout?.on("data", scan);
    child.stderr?.on("data", scan);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start cloudflared: ${err.message}`));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited early with code ${code}`));
    });
  }).catch(async (err) => {
    child.kill("SIGKILL");
    throw err;
  });

  return {
    origin,
    async close() {
      if (child.exitCode !== null || child.killed) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const force = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(force);
          resolve();
        });
      });
    },
  };
}
