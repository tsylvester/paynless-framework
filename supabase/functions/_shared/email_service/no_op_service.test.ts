import {
  assert,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts"; // Use a specific version
import { NoOpEmailService } from "./no_op_service.ts";
import type { UserData } from "../types.ts"; // Use UserData
import { logger } from "../logger.ts"; // Import logger if needed for spy checks
import { spy } from "jsr:@std/testing/mock";

// Mock the logger to prevent console output during tests
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

// Simple test suite for NoOpEmailService
Deno.test("NoOpEmailService tests", async (t) => {
  // Instantiate with the mocked logger if needed, or rely on global mock
  // if logger is globally mocked elsewhere (not shown here)
  const service = new NoOpEmailService();

  await t.step("should instantiate without errors", () => {
    assertExists(service);
    assert(service instanceof NoOpEmailService);
  });

  const testUserData: UserData = {
    id: "test-id-123",
    email: "test@example.com",
    firstName: "Test",
    createdAt: new Date().toISOString(),
  };

  await t.step("addUserToList should exist and resolve", async () => {
    assertExists(service.addUserToList);
    await assert(service.addUserToList(testUserData) instanceof Promise);
    await service.addUserToList(testUserData);
  });

  await t.step("updateUserAttributes should exist and resolve", async () => {
    assertExists(service.updateUserAttributes);
    const attributes: Partial<UserData> = { firstName: "Updated" };
    await assert(
      service.updateUserAttributes(testUserData.email, attributes) instanceof
        Promise,
    );
    await service.updateUserAttributes(testUserData.email, attributes);
  });

  // Test optional methods if they exist
  if (service.trackEvent) {
    await t.step("trackEvent should exist and resolve", async () => {
      assertExists(service.trackEvent);
      await assert(
        service.trackEvent!(testUserData.email, "test_event") instanceof Promise,
      );
      await service.trackEvent!(testUserData.email, "test_event");
    });
  }

  if (service.removeUser) {
    await t.step("removeUser should exist and resolve", async () => {
      assertExists(service.removeUser);
      await assert(service.removeUser!(testUserData.email) instanceof Promise);
      await service.removeUser!(testUserData.email);
    });
  }
});

// Removed the old "NoOpService Tests" block as it was using outdated references 