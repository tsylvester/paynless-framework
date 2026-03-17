import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock";
import { generateInstallationToken } from "./github_token.ts";
import type {
  GenerateInstallationTokenDeps,
  GenerateInstallationTokenParams,
} from "../types/github.types.ts";
import { decodeJwtPayload } from "./github_token.ts";

const MOCK_APP_ID = "12345";
const MOCK_INSTALLATION_ID = 99;
const MOCK_ACCESS_TOKEN = "ghs_mock_installation_token";

let validDeps: GenerateInstallationTokenDeps;
const validParams: GenerateInstallationTokenParams = {
  installationId: MOCK_INSTALLATION_ID,
};

async function buildValidDeps(): Promise<GenerateInstallationTokenDeps> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const bytes = new Uint8Array(exported);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g);
  const body = lines !== null ? lines.join("\n") : base64;
  const pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  return {
    appId: MOCK_APP_ID,
    privateKey: pem,
  };
}

function authFromInit(init: RequestInit | undefined): string | null {
  if (!init?.headers) return null;
  const h: HeadersInit = init.headers;
  if (h instanceof Headers) return h.get("Authorization");
  if (Array.isArray(h)) {
    const entry = h.find((pair: [string, string]) => pair[0] === "Authorization");
    return entry ? entry[1] : null;
  }
  const rec: Record<string, string> = h;
  return rec["Authorization"] ?? null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

Deno.test("generateInstallationToken: generates a valid JWT with iss set to appId, iat and exp claims, signed with RS256", async () => {
  validDeps = await buildValidDeps();
  const fetchStub = stub(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    const auth = authFromInit(init);
    assert(auth !== null);
    const raw = decodeJwtPayload(auth);
    assertEquals(raw.iss, MOCK_APP_ID);
    assert(typeof raw.iat === "number");
    assert(typeof raw.exp === "number");
    return Promise.resolve(
      new Response(JSON.stringify({ token: MOCK_ACCESS_TOKEN }), { status: 201 })
    );
  });
  try {
    await generateInstallationToken(validDeps, validParams);
    assertSpyCalls(fetchStub, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("generateInstallationToken: calls POST https://api.github.com/app/installations/{installationId}/access_tokens with JWT as Bearer token", async () => {
  validDeps = await buildValidDeps();
  let capturedUrl = "";
  let capturedAuth: string | null = null;
  const fetchStub = stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = requestUrl(input);
    capturedAuth = authFromInit(init);
    return Promise.resolve(
      new Response(JSON.stringify({ token: MOCK_ACCESS_TOKEN }), { status: 201 })
    );
  });
  try {
    await generateInstallationToken(validDeps, validParams);
    assertSpyCalls(fetchStub, 1);
    assertEquals(
      capturedUrl,
      `https://api.github.com/app/installations/${MOCK_INSTALLATION_ID}/access_tokens`
    );
    assert(capturedAuth !== null);
    const auth: string = capturedAuth;
    assert(auth.startsWith("Bearer "));
  } finally {
    fetchStub.restore();
  }
});

Deno.test("generateInstallationToken: returns the token field from the GitHub API response", async () => {
  validDeps = await buildValidDeps();
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ token: MOCK_ACCESS_TOKEN }), { status: 201 })
    )
  );
  try {
    const result: string = await generateInstallationToken(validDeps, validParams);
    assertEquals(result, MOCK_ACCESS_TOKEN);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("generateInstallationToken: throws if privateKey is missing or empty", async (t) => {
  await t.step("throws when privateKey is empty string", async () => {
    const depsEmptyKey: GenerateInstallationTokenDeps = {
      appId: MOCK_APP_ID,
      privateKey: "",
    };
    await assertRejects(
      () => generateInstallationToken(depsEmptyKey, validParams),
      Error
    );
  });
  await t.step("throws when privateKey is missing", async () => {
    const depsMissingKey = { appId: MOCK_APP_ID };
    await assertRejects(
      () =>
        generateInstallationToken(
          depsMissingKey as GenerateInstallationTokenDeps,
          validParams
        ),
      Error
    );
  });
});

Deno.test("generateInstallationToken: throws if GitHub API returns non-201 response", async () => {
  validDeps = await buildValidDeps();
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
    )
  );
  try {
    await assertRejects(
      () => generateInstallationToken(validDeps, validParams),
      Error
    );
  } finally {
    fetchStub.restore();
  }
});
