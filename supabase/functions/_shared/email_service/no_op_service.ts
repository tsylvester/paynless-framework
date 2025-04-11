import { logger } from "../logger.ts";
import { type UserData, type IEmailMarketingService } from "../types.ts";

/**
 * A service implementation that performs no actual operations.
 * Useful when email marketing is disabled or for testing.
 */
export class NoOpService implements IEmailMarketingService {
    constructor() {
        logger.info("Initialized NoOpEmailService.");
    }

    async addUserToList(userData: UserData): Promise<void> {
        logger.info(`NoOpService: addUserToList called for ${userData.email}. Doing nothing.`);
        // No operation
        return Promise.resolve();
    }

    // TODO: Implement updateUser based on IEmailMarketingService definition
    async updateUserAttributes(email: string, attributes: Partial<UserData>): Promise<void> {
         logger.info(`NoOpService: updateUserAttributes called for ${email} with attributes:`, attributes);
        // No operation
        return Promise.resolve();
    }

    // TODO: Implement removeUser based on IEmailMarketingService definition
    async removeUser(email: string): Promise<void> { // Match interface definition (email only)
        logger.info(`NoOpService: removeUser called for ${email}. Doing nothing.`);
        // No operation
        return Promise.resolve();
    }
    
    // Optional: Implement trackEvent if needed
    // async trackEvent(email: string, eventName: string, properties?: Record<string, any>): Promise<void> {
    //     logger.info(`NoOpService: trackEvent called for ${email}, event: ${eventName}. Doing nothing.`);
    //     return Promise.resolve();
    // }
} 