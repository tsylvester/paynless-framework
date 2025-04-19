import type {
  EmailMarketingService,
  UserData,
} from "../types.ts"; // Updated import path
// Note: Adjust the relative path based on your final structure if needed
import { logger } from "../logger.ts"; // Assuming logger is in the _shared root

/**
 * A no-operation implementation of the EmailMarketingService.
 * Used when no specific email provider is configured.
 * Implements the multi-method interface.
 */
export class NoOpEmailService implements EmailMarketingService {
  constructor() {
    logger.info(
      "[EmailService] No email provider configured. Using NoOpEmailService.",
    );
  }

  /**
   * Logs the intention to add a user but performs no action.
   * @param userData The user data (ignored).
   * @returns A resolved promise.
   */
  async addUserToList(userData: UserData): Promise<void> {
    logger.debug("[NoOpEmailService] Skipping addUserToList call.", {
      email: userData.email,
      id: userData.id,
    });
    await Promise.resolve();
  }

  /**
   * Logs the intention to update user attributes but performs no action.
   * @param email The user's email (ignored).
   * @param attributes The attributes to update (ignored).
   * @returns A resolved promise.
   */
  async updateUserAttributes(
    email: string,
    attributes: Partial<UserData>,
  ): Promise<void> {
    logger.debug("[NoOpEmailService] Skipping updateUserAttributes call.", {
      email: email,
      attributes: Object.keys(attributes), // Log which keys were attempted
    });
    await Promise.resolve();
  }

  // Optional methods - provide empty implementations

  /**
   * Logs the intention to track an event but performs no action.
   * @param email The user's email (ignored).
   * @param eventName The event name (ignored).
   * @param properties Event properties (ignored).
   * @returns A resolved promise.
   */
  async trackEvent?(
    email: string,
    eventName: string,
    properties?: Record<string, any>,
  ): Promise<void> {
    logger.debug("[NoOpEmailService] Skipping trackEvent call.", {
      email,
      eventName,
      hasProperties: !!properties,
    });
    await Promise.resolve();
  }

  /**
   * Logs the intention to remove a user but performs no action.
   * @param email The user's email (ignored).
   * @returns A resolved promise.
   */
  async removeUser?(email: string): Promise<void> {
    logger.debug("[NoOpEmailService] Skipping removeUser call.", { email });
    await Promise.resolve();
  }
} 