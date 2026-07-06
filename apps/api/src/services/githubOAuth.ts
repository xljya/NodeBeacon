import type { ApiEnv } from "../config/env.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const EMAILS_URL = "https://api.github.com/user/emails";

export interface GithubIdentity {
  login: string;
  email: string | null;
}

/** GitHub authorize URL for the OAuth web flow. */
export function buildAuthorizeUrl(env: ApiEnv, state: string, redirectUri: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env.githubClientId ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`GitHub request to ${url} failed with HTTP ${res.status}`);
  }
  return res.json();
}

/** Exchange the OAuth code for an access token, then load the GitHub identity. */
export async function exchangeCodeForIdentity(
  env: ApiEnv,
  code: string,
  redirectUri: string
): Promise<GithubIdentity> {
  const token = (await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: redirectUri
    })
  })) as { access_token?: string; error?: string; error_description?: string };

  if (!token.access_token) {
    throw new Error(token.error_description ?? token.error ?? "GitHub did not return an access token");
  }

  const authHeaders = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token.access_token}`,
    "user-agent": "NodeBeacon"
  };

  const user = (await fetchJson(USER_URL, { headers: authHeaders })) as {
    login: string;
    email: string | null;
  };

  let email = user.email;
  if (!email) {
    // Public email may be hidden; fall back to the primary verified email.
    try {
      const emails = (await fetchJson(EMAILS_URL, { headers: authHeaders })) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    } catch {
      email = null;
    }
  }

  return { login: user.login, email };
}
