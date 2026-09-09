import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { once } from "node:events";

export interface Hosted {
  /** Unguessable path the payload is served at, e.g. "/a1b2c3.../". */
  path: string;
  port: number;
  /** Resolves the first time something outside this machine fetches it. */
  fetched: Promise<{ userAgent: string; at: Date }>;
  close(): Promise<void>;
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1";
}

/**
 * Serve one HTML payload on localhost at a random path.
 *
 * The path is 128 bits of randomness, so the URL is not discoverable during
 * the seconds it is reachable. Every other path returns 404.
 */
export async function serveOnce(html: string): Promise<Hosted> {
  const token = randomBytes(16).toString("hex");
  const path = `/${token}`;
  const body = Buffer.from(html, "utf8");

  let announceFetch: (info: { userAgent: string; at: Date }) => void;
  const fetched = new Promise<{ userAgent: string; at: Date }>((resolve) => {
    announceFetch = resolve;
  });

  const server: Server = createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0].replace(/\/$/, "") || "/";
    if (url !== path) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(body.length),
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    });
    res.end(req.method === "HEAD" ? undefined : body);

    if (!isLoopback(req.socket.remoteAddress)) {
      announceFetch({
        userAgent: req.headers["user-agent"] ?? "unknown",
        at: new Date(),
      });
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("could not bind a local port");
  }

  return {
    path,
    port: address.port,
    fetched,
    async close() {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
