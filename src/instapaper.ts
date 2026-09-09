import { spawn } from "node:child_process";

const ADD_URL = "https://www.instapaper.com/api/add";
const SAVE_URL = "https://www.instapaper.com/hello2";

export interface Credentials {
  username: string;
  password: string;
}

/** Read credentials from the environment, if the user set them. */
export function credentialsFromEnv(): Credentials | null {
  const username = process.env.INSTAPAPER_USERNAME?.trim();
  if (!username) return null;
  return { username, password: process.env.INSTAPAPER_PASSWORD ?? "" };
}

/**
 * Add a URL with the Simple API.
 *
 * This endpoint needs no developer approval, unlike the Full API. It accepts
 * only a URL, which is all this tool needs: the URL already points at the
 * cleaned payload.
 */
export async function addByApi(
  url: string,
  title: string,
  creds: Credentials,
): Promise<void> {
  const body = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    url,
    title,
  });

  const res = await fetch(ADD_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (res.status === 201) return;
  if (res.status === 403) {
    throw new Error(
      "Instapaper rejected those credentials (403). If you sign in with " +
        "Google or Apple your account has no password, so use --open instead.",
    );
  }
  throw new Error(`Instapaper returned ${res.status} ${res.statusText}`);
}

/**
 * Open the save page in the browser, using the existing session.
 * Set TIDYREAD_BROWSER (e.g. "Safari") to pick an app; otherwise the
 * system default browser opens it.
 */
export function addByBrowser(url: string): string {
  const saveUrl = `${SAVE_URL}?url=${encodeURIComponent(url)}`;
  const app = process.env.TIDYREAD_BROWSER?.trim();
  const args = app ? ["-a", app, saveUrl] : [saveUrl];
  spawn("open", args, { stdio: "ignore", detached: true }).unref();
  return saveUrl;
}
