import type {
  GenerateInstallationTokenDeps,
  GenerateInstallationTokenParams,
  GenerateInstallationTokenReturn,
  GitHubAppJwtPayload,
  GitHubInstallationTokenResponse,
} from "../types/github.types.ts";
import { isRecord } from "./type-guards/type_guards.common.ts";

const GITHUB_API_BASE = "https://api.github.com";
const JWT_HEADER = { alg: "RS256", typ: "JWT" } as const;

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function decodeJwtPayload(authHeader: string): GitHubAppJwtPayload {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  const payloadBytes = base64urlDecode(parts[1]);
  const payloadStr = new TextDecoder().decode(payloadBytes);
  const raw: unknown = JSON.parse(payloadStr);
  if (!isRecord(raw)) {
    throw new Error("Invalid JWT payload shape");
  }
  const iss: unknown = raw.iss;
  const iat: unknown = raw.iat;
  const exp: unknown = raw.exp;
  if (typeof iss !== "string" || typeof iat !== "number" || typeof exp !== "number") {
    throw new Error("Invalid JWT payload shape");
  }
  const payload: GitHubAppJwtPayload = { iss, iat, exp };
  return payload;
}

function pemToBinary(pem: string): ArrayBuffer {
  const trimmed = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s/g, "");
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const binary = pemToBinary(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"]
  );
}

function encodeJwtPayload(payload: GitHubAppJwtPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export async function generateInstallationToken(
  deps: GenerateInstallationTokenDeps,
  params: GenerateInstallationTokenParams
): Promise<GenerateInstallationTokenReturn> {
  const privateKey = Object.getOwnPropertyDescriptor(deps, "privateKey")?.value;
  if (typeof privateKey !== "string" || privateKey.trim() === "") {
    throw new Error("privateKey is required and must be non-empty");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: GitHubAppJwtPayload = {
    iss: deps.appId,
    iat: now - 60,
    exp: now + 600,
  };

  const headerB64 = base64urlEncode(
    new Uint8Array(new TextEncoder().encode(JSON.stringify(JWT_HEADER)))
  );
  const payloadB64 = base64urlEncode(encodeJwtPayload(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(deps.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput)
  );
  const signatureB64 = base64urlEncode(new Uint8Array(signature));
  const jwt = `${signingInput}.${signatureB64}`;

  const url = `${GITHUB_API_BASE}/app/installations/${params.installationId}/access_tokens`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (response.status !== 201) {
    const body: string = await response.text();
    let message: string = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed)) {
        const msg: unknown = parsed.message;
        if (typeof msg === "string") {
          message = msg;
        }
      }
    } catch {
      // use raw body
    }
    throw new Error(`GitHub API error (${response.status}): ${message}`);
  }

  const raw: unknown = await response.json();
  if (!isRecord(raw)) {
    throw new Error("GitHub API response is not an object");
  }
  const tokenValue: unknown = raw.token;
  if (typeof tokenValue !== "string") {
    throw new Error("GitHub API response missing token");
  }
  const data: GitHubInstallationTokenResponse = { token: tokenValue };
  const token: GenerateInstallationTokenReturn = data.token;
  return token;
}
