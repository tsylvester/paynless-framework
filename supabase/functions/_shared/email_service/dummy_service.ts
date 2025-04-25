import { type UserData, type EmailMarketingService } from "@paynless/types/email";
import { logger } from "../logger.ts";

/**
 * A no-operation email marketing service implementation.
 * Used when no provider is configured or for local testing.
 */
export class DummyEmailService implements EmailMarketingService {
  constructor() {
    logger.info('DummyEmailService initialized (no email marketing operations will occur).');
  }

  async addUserToList(userData: UserData): Promise<void> {
    logger.debug('[DummyEmailService] Skipping addUserToList for:', { email: userData.email });
    // Do nothing
    return Promise.resolve();
  }

  async updateUserAttributes(email: string, attributes: Partial<UserData>): Promise<void> {
    logger.debug('[DummyEmailService] Skipping updateUserAttributes for:', { email, attributes: Object.keys(attributes) });
    // Do nothing
    return Promise.resolve();
  }

  async trackEvent(email: string, eventName: string, properties?: Record<string, any>): Promise<void> {
    logger.debug('[DummyEmailService] Skipping trackEvent:', { email, eventName, hasProperties: !!properties });
    // Do nothing
    return Promise.resolve();
  }

  async removeUser(email: string): Promise<void> {
    logger.debug('[DummyEmailService] Skipping removeUser for:', { email });
    // Do nothing
    return Promise.resolve();
  }
} 