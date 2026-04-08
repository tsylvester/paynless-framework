import { assertEquals } from "jsr:@std/assert@0.225.3";
import { isStreamRequestDeps } from "./streamRequest.guard.ts";
import {
  buildContractStreamRequestDeps,
  buildStreamRequestDepsMissingPrepareChatContext,
  buildStreamRequestDepsMissingStreamChat,
  buildStreamRequestDepsMissingStreamRewind,
} from "./streamRequest.mock.ts";

Deno.test(
  "isStreamRequestDeps returns true when value matches StreamRequestDeps shape",
  () => {
    assertEquals(isStreamRequestDeps(buildContractStreamRequestDeps()), true);
  },
);

Deno.test("isStreamRequestDeps returns false for null", () => {
  assertEquals(isStreamRequestDeps(null), false);
});

Deno.test("isStreamRequestDeps returns false for empty object", () => {
  assertEquals(isStreamRequestDeps({}), false);
});

Deno.test(
  "isStreamRequestDeps returns false when streamChat key is absent",
  () => {
    assertEquals(
      isStreamRequestDeps(buildStreamRequestDepsMissingStreamChat()),
      false,
    );
  },
);

Deno.test(
  "isStreamRequestDeps returns false when streamRewind key is absent",
  () => {
    assertEquals(
      isStreamRequestDeps(buildStreamRequestDepsMissingStreamRewind()),
      false,
    );
  },
);

Deno.test(
  "isStreamRequestDeps returns false when prepareChatContext key is absent",
  () => {
    assertEquals(
      isStreamRequestDeps(buildStreamRequestDepsMissingPrepareChatContext()),
      false,
    );
  },
);
