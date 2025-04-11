import { assertExists } from "jsr:@std/assert";
import { NoOpService } from "./no_op_service.ts";
import { type UserData } from "../types.ts";
import { logger } from "../logger.ts"; // Import logger if needed for spy checks
import { spy } from "jsr:@std/testing/mock";

Deno.test("NoOpService Tests", async (t) => {
  const service = new NoOpService();

  const testUser: UserData = {
    id: "user-uuid-noop",
    email: "noop@example.com",
    createdAt: new Date().toISOString(),
  };

  await t.step("`addUserToList` exists and runs without error", async () => {
    assertExists(service.addUserToList);
    const logSpy = spy(logger, 'info');
    try {
        await service.addUserToList(testUser);
        // No error thrown is success
        // Optional: Check if logger.info was called (if logging is implemented)
        // assertSpyCall(logSpy, 0, { args: ["NoOpService: addUserToList called for noop@example.com. Doing nothing."] });
    } finally {
        logSpy.restore();
    }
  });

  await t.step("`updateUserAttributes` exists and runs without error", async () => {
    assertExists(service.updateUserAttributes);
    const logSpy = spy(logger, 'info');
    try {
        await service.updateUserAttributes(testUser.email, { firstName: "test" });
        // No error thrown is success
    } finally {
        logSpy.restore();
    }
  });

  await t.step("`removeUser` exists and runs without error", async () => {
    assertExists(service.removeUser);
     const logSpy = spy(logger, 'info');
    try {
        await service.removeUser(testUser.email);
        // No error thrown is success
    } finally {
        logSpy.restore();
    }
  });
}); 