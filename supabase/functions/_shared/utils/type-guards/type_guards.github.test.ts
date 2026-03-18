import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubRefResponse,
  GitHubCommitResponse,
  GitHubBlobResponse,
  GitHubTreeResponse,
  GitHubCommitCreateResponse,
  GitHubApiErrorBody,
  GitHubPushResult,
  GitHubCreateRepoPayload,
} from "../../types/github.types.ts";
import {
  isGitHubApiErrorBody,
  isGitHubUser,
  isGitHubRepo,
  isGitHubRepoArray,
  isGitHubBranch,
  isGitHubBranchArray,
  isGitHubRefResponse,
  isGitHubCommitResponse,
  isGitHubBlobResponse,
  isGitHubTreeResponse,
  isGitHubCommitCreateResponse,
  isGitHubPushResult,
  isGitHubCreateRepoPayload,
  isGithubServiceRequestBody,
  isStoreInstallationPayload,
  isListBranchesParams,
  parseGitHubUser,
  parseGitHubRepo,
  parseGitHubRepoArray,
  parseGitHubBranch,
  parseGitHubBranchArray,
  parseGitHubPushResult,
  parseCreateRepoPayload,
  requireCreateRepoPayload,
} from "./type_guards.github.ts";

const validUser: GitHubUser = { id: 1, login: "u", avatar_url: "https://a" };
const validRepo: GitHubRepo = {
  id: 1,
  name: "r",
  full_name: "u/r",
  owner: { login: "u" },
  default_branch: "main",
  private: false,
  html_url: "https://r",
};
const validBranch: GitHubBranch = { name: "main", commit: { sha: "abc" }, protected: false };
const validRefResponse: GitHubRefResponse = { object: { sha: "sha" } };
const validCommitResponse: GitHubCommitResponse = { sha: "sha", tree: { sha: "treesha" } };
const validBlobResponse: GitHubBlobResponse = { sha: "blobsha" };
const validTreeResponse: GitHubTreeResponse = { sha: "treesha" };
const validCommitCreateResponse: GitHubCommitCreateResponse = { sha: "commitsha" };
const validPushResult: GitHubPushResult = { commitSha: "c", filesUpdated: 1 };
const validCreateRepoPayload: GitHubCreateRepoPayload = { name: "repo" };

Deno.test("type_guards.github: isGitHubApiErrorBody", async (t) => {
  await t.step("returns true for object with string message", () => {
    assert(isGitHubApiErrorBody({ message: "Not Found" }));
  });
  await t.step("returns true for object without message", () => {
    assert(isGitHubApiErrorBody({}));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubApiErrorBody(null));
  });
  await t.step("returns false for non-object", () => {
    assert(!isGitHubApiErrorBody("string"));
  });
  await t.step("returns false when message is not string", () => {
    assert(!isGitHubApiErrorBody({ message: 123 }));
  });
});

Deno.test("type_guards.github: isGitHubUser", async (t) => {
  await t.step("returns true for valid GitHubUser", () => {
    assert(isGitHubUser(validUser));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubUser(null));
  });
  await t.step("returns false when id is missing", () => {
    assert(!isGitHubUser({ login: "u", avatar_url: "a" }));
  });
  await t.step("returns false when id is not number", () => {
    assert(!isGitHubUser({ id: "1", login: "u", avatar_url: "a" }));
  });
  await t.step("returns false when login is not string", () => {
    assert(!isGitHubUser({ id: 1, login: 2, avatar_url: "a" }));
  });
});

Deno.test("type_guards.github: isGitHubRepo", async (t) => {
  await t.step("returns true for valid GitHubRepo", () => {
    assert(isGitHubRepo(validRepo));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubRepo(null));
  });
  await t.step("returns false when owner is not object", () => {
    assert(!isGitHubRepo({ ...validRepo, owner: "bad" }));
  });
  await t.step("returns false when owner.login is missing", () => {
    assert(!isGitHubRepo({ ...validRepo, owner: {} }));
  });
});

Deno.test("type_guards.github: isGitHubRepoArray", async (t) => {
  await t.step("returns true for array of valid GitHubRepo", () => {
    assert(isGitHubRepoArray([validRepo]));
  });
  await t.step("returns false for non-array", () => {
    assert(!isGitHubRepoArray(validRepo));
  });
  await t.step("returns false when an element is invalid", () => {
    assert(!isGitHubRepoArray([validRepo, { id: 2 }]));
  });
});

Deno.test("type_guards.github: isGitHubBranch", async (t) => {
  await t.step("returns true for valid GitHubBranch", () => {
    assert(isGitHubBranch(validBranch));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubBranch(null));
  });
  await t.step("returns false when commit is not object", () => {
    assert(!isGitHubBranch({ ...validBranch, commit: "x" }));
  });
  await t.step("returns false when commit.sha is not string", () => {
    assert(!isGitHubBranch({ name: "main", commit: { sha: 1 }, protected: false }));
  });
});

Deno.test("type_guards.github: isGitHubBranchArray", async (t) => {
  await t.step("returns true for array of valid GitHubBranch", () => {
    assert(isGitHubBranchArray([validBranch]));
  });
  await t.step("returns false for non-array", () => {
    assert(!isGitHubBranchArray(validBranch));
  });
});

Deno.test("type_guards.github: isGitHubRefResponse", async (t) => {
  await t.step("returns true for valid GitHubRefResponse", () => {
    assert(isGitHubRefResponse(validRefResponse));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubRefResponse(null));
  });
  await t.step("returns false when object is not object", () => {
    assert(!isGitHubRefResponse({ object: "x" }));
  });
  await t.step("returns false when object.sha is not string", () => {
    assert(!isGitHubRefResponse({ object: { sha: 1 } }));
  });
});

Deno.test("type_guards.github: isGitHubCommitResponse", async (t) => {
  await t.step("returns true for valid with tree", () => {
    assert(isGitHubCommitResponse(validCommitResponse));
  });
  await t.step("returns true for valid without tree", () => {
    assert(isGitHubCommitResponse({ sha: "sha" }));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubCommitResponse(null));
  });
  await t.step("returns false when sha is not string", () => {
    assert(!isGitHubCommitResponse({ sha: 1 }));
  });
});

Deno.test("type_guards.github: isGitHubBlobResponse", async (t) => {
  await t.step("returns true for valid GitHubBlobResponse", () => {
    assert(isGitHubBlobResponse(validBlobResponse));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubBlobResponse(null));
  });
  await t.step("returns false when sha is not string", () => {
    assert(!isGitHubBlobResponse({ sha: 1 }));
  });
});

Deno.test("type_guards.github: isGitHubTreeResponse", async (t) => {
  await t.step("returns true for valid GitHubTreeResponse", () => {
    assert(isGitHubTreeResponse(validTreeResponse));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubTreeResponse(null));
  });
});

Deno.test("type_guards.github: isGitHubCommitCreateResponse", async (t) => {
  await t.step("returns true for valid GitHubCommitCreateResponse", () => {
    assert(isGitHubCommitCreateResponse(validCommitCreateResponse));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubCommitCreateResponse(null));
  });
});

Deno.test("type_guards.github: isGitHubPushResult", async (t) => {
  await t.step("returns true for valid GitHubPushResult", () => {
    assert(isGitHubPushResult(validPushResult));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubPushResult(null));
  });
  await t.step("returns false when commitSha is not string", () => {
    assert(!isGitHubPushResult({ commitSha: 1, filesUpdated: 1 }));
  });
  await t.step("returns false when filesUpdated is not number", () => {
    assert(!isGitHubPushResult({ commitSha: "c", filesUpdated: "1" }));
  });
});

Deno.test("type_guards.github: isGitHubCreateRepoPayload", async (t) => {
  await t.step("returns true for valid with only name", () => {
    assert(isGitHubCreateRepoPayload(validCreateRepoPayload));
  });
  await t.step("returns true for valid with optional fields", () => {
    assert(isGitHubCreateRepoPayload({ name: "r", description: "d", private: true, auto_init: false }));
  });
  await t.step("returns false for null", () => {
    assert(!isGitHubCreateRepoPayload(null));
  });
  await t.step("returns false when name is not string", () => {
    assert(!isGitHubCreateRepoPayload({ name: 1 }));
  });
});

Deno.test("type_guards.github: parseGitHubUser", async (t) => {
  await t.step("returns value when valid", () => {
    const out: GitHubUser = parseGitHubUser(validUser);
    assertEquals(out.id, validUser.id);
  });
  await t.step("throws when invalid", () => {
    assertThrows(() => parseGitHubUser(null), Error, "invalid user");
  });
});

Deno.test("type_guards.github: parseGitHubRepo", async (t) => {
  await t.step("returns value when valid", () => {
    const out: GitHubRepo = parseGitHubRepo(validRepo);
    assertEquals(out.name, validRepo.name);
  });
  await t.step("throws when invalid", () => {
    assertThrows(() => parseGitHubRepo(null), Error, "invalid repo");
  });
});

Deno.test("type_guards.github: parseGitHubRepoArray", async (t) => {
  await t.step("returns value when valid", () => {
    const out: GitHubRepo[] = parseGitHubRepoArray([validRepo]);
    assert(out.length === 1);
  });
  await t.step("throws when invalid", () => {
    assertThrows(() => parseGitHubRepoArray({}), Error, "invalid repo array");
  });
});

Deno.test("type_guards.github: parseGitHubBranch", async (t) => {
  await t.step("returns value when valid", () => {
    const out: GitHubBranch = parseGitHubBranch(validBranch);
    assertEquals(out.name, validBranch.name);
  });
  await t.step("throws when invalid", () => {
    assertThrows(() => parseGitHubBranch(null), Error, "invalid branch");
  });
});

Deno.test("type_guards.github: parseGitHubBranchArray", async (t) => {
  await t.step("returns value when valid", () => {
    const out: GitHubBranch[] = parseGitHubBranchArray([validBranch]);
    assert(out.length === 1);
  });
  await t.step("throws when invalid", () => {
    assertThrows(() => parseGitHubBranchArray(null), Error, "invalid branch array");
  });
});

Deno.test("type_guards.github: parseGitHubPushResult", async (t) => {
  await t.step("returns value when valid", () => {
    const out: GitHubPushResult = parseGitHubPushResult(validPushResult);
    assertEquals(out.commitSha, validPushResult.commitSha);
  });
  await t.step("throws when invalid", () => {
    assertThrows(() => parseGitHubPushResult(null), Error, "invalid push result");
  });
});

Deno.test("type_guards.github: parseCreateRepoPayload", async (t) => {
  await t.step("returns payload when valid", () => {
    const out: GitHubCreateRepoPayload | null = parseCreateRepoPayload(validCreateRepoPayload);
    assert(out !== null);
    assertEquals(out.name, validCreateRepoPayload.name);
  });
  await t.step("returns null when input is null", () => {
    assertEquals(parseCreateRepoPayload(null), null);
  });
});

Deno.test("type_guards.github: requireCreateRepoPayload", async (t) => {
  await t.step("returns payload when non-null", () => {
    const out: GitHubCreateRepoPayload = requireCreateRepoPayload(validCreateRepoPayload);
    assertEquals(out.name, validCreateRepoPayload.name);
  });
  await t.step("throws when null", () => {
    assertThrows(() => requireCreateRepoPayload(null), Error, "expected payload");
  });
});

Deno.test("type_guards.github: isStoreInstallationPayload", async (t) => {
  await t.step("returns true for valid StoreInstallationPayload", () => {
    assert(
      isStoreInstallationPayload({
        installationId: 123,
        installation_target_type: "User",
        installation_target_id: 456,
      })
    );
  });
  await t.step("returns true for installation_target_type Organization", () => {
    assert(
      isStoreInstallationPayload({
        installationId: 1,
        installation_target_type: "Organization",
        installation_target_id: 2,
      })
    );
  });
  await t.step("returns false for null", () => {
    assert(!isStoreInstallationPayload(null));
  });
  await t.step("returns false when installationId is not number", () => {
    assert(
      !isStoreInstallationPayload({
        installationId: "123",
        installation_target_type: "User",
        installation_target_id: 456,
      })
    );
  });
  await t.step("returns false when installation_target_type is invalid", () => {
    assert(
      !isStoreInstallationPayload({
        installationId: 123,
        installation_target_type: "Invalid",
        installation_target_id: 456,
      })
    );
  });
  await t.step("returns false when installation_target_id is not number", () => {
    assert(
      !isStoreInstallationPayload({
        installationId: 123,
        installation_target_type: "User",
        installation_target_id: "456",
      })
    );
  });
});

Deno.test("type_guards.github: isListBranchesParams", async (t) => {
  await t.step("returns true for valid ListBranchesParams", () => {
    assert(isListBranchesParams({ owner: "octocat", repo: "repo1" }));
  });
  await t.step("returns false for null", () => {
    assert(!isListBranchesParams(null));
  });
  await t.step("returns false when owner is not string", () => {
    assert(!isListBranchesParams({ owner: 1, repo: "r" }));
  });
  await t.step("returns false when repo is not string", () => {
    assert(!isListBranchesParams({ owner: "o", repo: 2 }));
  });
  await t.step("returns false when owner is missing", () => {
    assert(!isListBranchesParams({ repo: "r" }));
  });
  await t.step("returns false when repo is missing", () => {
    assert(!isListBranchesParams({ owner: "o" }));
  });
});

Deno.test("type_guards.github: isGithubServiceRequestBody", async (t) => {
  await t.step("returns true for storeInstallation with valid payload", () => {
    assert(
      isGithubServiceRequestBody({
        action: "storeInstallation",
        payload: {
          installationId: 1,
          installation_target_type: "User",
          installation_target_id: 2,
        },
      })
    );
  });
  await t.step("returns true for getConnectionStatus", () => {
    assert(isGithubServiceRequestBody({ action: "getConnectionStatus", payload: {} }));
  });
  await t.step("returns true for disconnectGitHub", () => {
    assert(isGithubServiceRequestBody({ action: "disconnectGitHub", payload: {} }));
  });
  await t.step("returns true for listRepos", () => {
    assert(isGithubServiceRequestBody({ action: "listRepos", payload: {} }));
  });
  await t.step("returns true for listBranches with valid payload", () => {
    assert(
      isGithubServiceRequestBody({
        action: "listBranches",
        payload: { owner: "o", repo: "r" },
      })
    );
  });
  await t.step("returns true for createRepo with valid payload", () => {
    assert(
      isGithubServiceRequestBody({
        action: "createRepo",
        payload: { name: "my-repo" },
      })
    );
  });
  await t.step("returns false for null", () => {
    assert(!isGithubServiceRequestBody(null));
  });
  await t.step("returns false for non-object", () => {
    assert(!isGithubServiceRequestBody("string"));
  });
  await t.step("returns false for unknown action", () => {
    assert(!isGithubServiceRequestBody({ action: "unknownAction", payload: {} }));
  });
  await t.step("returns false for storeInstallation with invalid payload", () => {
    assert(
      !isGithubServiceRequestBody({
        action: "storeInstallation",
        payload: { installationId: "not-a-number" },
      })
    );
  });
  await t.step("returns false for listBranches with invalid payload", () => {
    assert(
      !isGithubServiceRequestBody({
        action: "listBranches",
        payload: { owner: "o" },
      })
    );
  });
  await t.step("returns false for createRepo with invalid payload", () => {
    assert(
      !isGithubServiceRequestBody({
        action: "createRepo",
        payload: { name: 123 },
      })
    );
  });
});
