
/**
 * Represents the standard user data structure for email marketing services.
 * From packages/types/src/email.types.ts
 */
export interface UserData {
    id: string; // Your internal user ID
    email: string;
    firstName?: string;
    lastName?: string;
    createdAt: string; // ISO string format recommended
    lastSignInAt?: string; // ISO string format
    // Add other standard fields you might want to sync
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // Allows for platform-specific custom fields
  }

  // --- Email Marketing Service Interface ---
// From packages/types/src/email.types.ts

/**
 * Defines the common contract for interacting with different email marketing platforms.
 */
export interface EmailMarketingService {
    /**
     * Adds a new user/subscriber to the primary list/audience/tag.
     * @param userData - The user's details.
     */
    addUserToList(userData: UserData): Promise<void>;
  
    /**
     * Updates attributes/custom fields for an existing user/subscriber.
     * Typically identified by email or their ID in the marketing platform.
     * @param email - The user's email address to identify them.
     * @param attributes - An object containing the fields to update.
     */
    updateUserAttributes(email: string, attributes: Partial<UserData>): Promise<void>;
  
    /**
     * (Optional but recommended for advanced segmentation)
     * Tracks a specific event performed by the user.
     * @param email - The user's email address.
     * @param eventName - The name of the event (e.g., 'Subscription Upgraded').
     * @param properties - Optional additional data about the event.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trackEvent?(email: string, eventName: string, properties?: Record<string, any>): Promise<void>;
  
    /**
     * (Optional) Removes a user from the list/unsubscribes them.
     * Usually handled by the platform's unsubscribe links, but useful for manual removal.
     * @param email - The user's email address.
     */
    removeUser?(email: string): Promise<void>;
  }