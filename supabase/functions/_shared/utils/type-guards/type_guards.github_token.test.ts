import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  GenerateInstallationTokenDeps,
  GenerateInstallationTokenParams,
} from "../../types/github.types.ts";
import {
  isGenerateInstallationTokenDeps,
  isGenerateInstallationTokenParams,
} from "./type_guards.github_token.ts";

const validDeps: GenerateInstallationTokenDeps = {
  appId: "12345",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
};

const validParams: GenerateInstallationTokenParams = {
  installationId: 99,
};

Deno.test("type_guards.github_token: isGenerateInstallationTokenDeps", async (t) => {
  await t.step("returns true for object with appId and privateKey as non-empty strings", () => {
    assert(isGenerateInstallationTokenDeps(validDeps));
  });
  await t.step("returns false for null", () => {
    assert(!isGenerateInstallationTokenDeps(null));
  });
  await t.step("returns false when appId is missing", () => {
    assert(!isGenerateInstallationTokenDeps({ privateKey: "x" }));
  });
  await t.step("returns false when appId is empty string", () => {
    assert(!isGenerateInstallationTokenDeps({ appId: "", privateKey: "x" }));
  });
  await t.step("returns false when appId is not string", () => {
    assert(!isGenerateInstallationTokenDeps({ appId: 1, privateKey: "x" }));
  });
  await t.step("returns false when privateKey is missing", () => {
    assert(!isGenerateInstallationTokenDeps({ appId: "1" }));
  });
  await t.step("returns false when privateKey is empty string", () => {
    assert(!isGenerateInstallationTokenDeps({ appId: "1", privateKey: "" }));
  });
  await t.step("returns false when privateKey is not string", () => {
    assert(!isGenerateInstallationTokenDeps({ appId: "1", privateKey: 2 }));
  });
});

Deno.test("type_guards.github_token: isGenerateInstallationTokenParams", async (t) => {
  await t.step("returns true for object with installationId as number", () => {
    assert(isGenerateInstallationTokenParams(validParams));
  });
  await t.step("returns false for null", () => {
    assert(!isGenerateInstallationTokenParams(null));
  });
  await t.step("returns false when installationId is missing", () => {
    assert(!isGenerateInstallationTokenParams({}));
  });
  await t.step("returns false when installationId is not number", () => {
    assert(!isGenerateInstallationTokenParams({ installationId: "99" }));
  });
  await t.step("returns false when installationId is not positive integer", () => {
    assert(!isGenerateInstallationTokenParams({ installationId: 0 }));
  });
  await t.step("returns false when installationId is negative", () => {
    assert(!isGenerateInstallationTokenParams({ installationId: -1 }));
  });
});
