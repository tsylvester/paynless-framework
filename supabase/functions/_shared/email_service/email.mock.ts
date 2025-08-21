import type { EmailMarketingService, UserData } from '../types.ts';

/**
 * Creates a mock object that conforms to the EmailMarketingService interface.
 * This implementation provides dummy async functions that can be spied on in tests.
 * This is useful for integration tests where you need to verify that a service method was called
 * without actually performing the real action (e.g., sending an email).
 *
 * @returns A mock EmailMarketingService object.
 *
 * @example
 * ```typescript
 * import { createMockEmailMarketingService } from './email.mock.ts';
 * import { spy } from "https://deno.land/std/testing/mock.ts";
 *
 * const mockEmailService = createMockEmailMarketingService();
 * const addUserSpy = spy(mockEmailService, "addUserToList");
 *
 * // In your test:
 * await myServiceThatUsesEmail.doSomething(userData);
 * assertSpyCalls(addUserSpy, 1);
 * ```
 */
export const createMockEmailMarketingService = (): EmailMarketingService => ({
  async addUserToList(userData: UserData) {
    console.log(`[MockEmailService] addUserToList called with:`, userData);
    await Promise.resolve();
  },
  async removeUser(email: string) {
    console.log(`[MockEmailService] removeUser called with:`, email);
    await Promise.resolve();
  },
  async updateUserAttributes(email: string, attributes: Partial<UserData>) {
    console.log(`[MockEmailService] updateUserAttributes called for ${email} with:`, attributes);
    await Promise.resolve();
  }
}); 