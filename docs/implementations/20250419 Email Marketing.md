
## Optional Email Marketing Sync on User Creation (Kit First)

**Goal:** Automatically add new users to a configured email marketing list (starting with Kit) if the corresponding API key is present in the environment variables. If not configured, the system should proceed without error.

**Phase 0: Service Definition & Setup**
*   **Goal:** Define the interface for an email marketing service and set up the basic file structure.
*   **Steps:**
    *   [✅] **Define Interface (`packages/types/src/email.types.ts`):**
        *   [✅] Create a new file `email.types.ts`.
        *   [✅] Define `EmailMarketingService` and `UserData` interfaces:
            ```typescript
            export interface UserData {
                id: string;
                email: string;
                firstName?: string;
                lastName?: string;
                createdAt: string; // ISO string format recommended
                lastSignInAt?: string; // ISO string format
                [key: string]: any;
            }

            export interface EmailMarketingService {
              addUserToList(userData: UserData): Promise<void>;
              updateUserAttributes(email: string, attributes: Partial<UserData>): Promise<void>;
              trackEvent?(email: string, eventName: string, properties?: Record<string, any>): Promise<void>;
              removeUser?(email: string): Promise<void>;
            }
            ```
        *   [✅] Export types from `packages/types/src/index.ts`.
    *   [✅] **Create Shared Service Directory (`supabase/functions/_shared/email_service/`):**
        *   [✅] Create the directory `supabase/functions/_shared/email_service/`.
    *   [✅] **Add Dependencies:** (Decision: Use standard `fetch` initially for simplicity).

**Phase 1: Null Adapter Implementation**
*   **Goal:** Implement the default "do nothing" behavior when no provider is configured.
*   **Location:** `supabase/functions/_shared/email_service/`
*   **Steps:**
    *   [✅] **Create `no_op_service.ts`:** Implement `EmailMarketingService` interface (`addUserToList`, `updateUserAttributes`, optional stubs) using `UserData`.
    *   [✅] **Write Unit Test (`no_op_service.test.ts`):** Verify methods exist and return resolved promises.

**Phase 2: Kit Adapter Implementation**
*   **Goal:** Implement the service logic for interacting with the Kit API.
*   **Location:** `supabase/functions/_shared/email_service/`
*   **Steps:**
    *   [✅] **Environment Variables:** Define `EMAIL_MARKETING_API_KEY`, `EMAIL_MARKETING_TAG_ID`, `KIT_CUSTOM_USER_ID_FIELD`, `KIT_CUSTOM_CREATED_AT_FIELD` in `.env.example`.
    *   [✅] **Create `kit_service.ts`:** (File exists with implementation)
        *   [✅] Implements `EmailMarketingService` interface.
        *   [✅] Constructor accepts `KitServiceConfig` object (to be populated from env vars by factory).
        *   [✅] Implements `addUserToList` method (maps `UserData`, calls Kit API).
        *   [✅] Implements `updateUserAttributes` (maps attributes, calls Kit API).
        *   [✅] Implements `removeUser` (calls Kit API).
        *   [❓] Needs review: `trackEvent` stub exists but might not be applicable to Kit.
    *   [✅] **Write Unit Test (`kit_service.test.ts`):**
        *   [✅] Test constructor with valid and invalid `KitServiceConfig` (warns, doesn't throw for optional).
        *   [✅] Mock `fetch` for Kit API endpoints.
        *   [✅] Test `addUserToList` (success, API error, missing config cases).
        *   [✅] Test `updateUserAttributes` (success, user not found, API error cases, find error cases).
        *   [✅] Test `removeUser` (success, user not found, API error cases, find error cases).

**Phase 3: Service Factory & Integration**
*   **Goal:** Create a factory to provide the correct service instance based on configuration and integrate it into the user creation flow.
*   **Location:** `supabase/functions/_shared/email_service/` and `supabase/functions/on-user-created/`
*   **Steps:**
    *   [✅] **Create `factory.ts` (`supabase/functions/_shared/email_service/`):**
        *   [✅] Import `NoOpEmailService` and `KitEmailService`.
        *   [✅] Create function `getEmailMarketingService(config: EmailFactoryConfig): EmailMarketingService`.
        *   [✅] Inside, read `config.provider`.
        *   [✅] If provider is 'kit' and required keys/fields are present in config:
            *   [✅] Construct `KitServiceConfig` object.
            *   [✅] Return `new KitEmailService(config)`.
        *   [✅] Else, return `new NoOpEmailService()`.
    *   [✅] **Write Unit Test (`factory.test.ts`):**
        *   [✅] Test scenarios: Kit configured, not configured, 'none', incomplete Kit, unknown provider.
        *   [✅] Verify correct service type (`KitService` or `NoOpEmailService`) is returned.
        *   [ ] Verify `KitService` constructor is called with correct config object. (Optional - Skipped for now)
    *   [✅] **Modify `on-user-created/index.ts`:** (Refactored to use factory via defaultDeps)
        *   [✅] Import `getEmailMarketingService`.
        *   [✅] Import `UserData` type.
        *   [✅] Inside the handler:
            *   [✅] Get `emailService` instance from deps. (Factory called within defaultDeps)
            *   [✅] Create `UserData` object from the auth hook record. (✅ Done)
            *   [✅] Call `await emailService.addUserToList(userData);`. (✅ Done)
            *   [✅] Wrap in try/catch for graceful error handling. (✅ Done)
    *   [✅] **Write/Update Unit Test (`on-user-created.test.ts`):** (Tests updated for DI)
        *   [✅] Mock service injection tests covering Kit, NoOp, and error cases.
        *   [✅] Test Case 1 (NoOp): Handler skips correctly when `NoOpEmailService` injected.
        *   [✅] Test Case 2 (Kit): Handler calls `addUserToList` on mock `Kit` with correct `UserData` when injected.
        *   [✅] Test Case 3: Handler continues (returns 200 OK) if `addUserToList` throws when injected.
