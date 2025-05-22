# Checklist: Wallet Refactor & Organization Token Policy

## Phase 1: Foundation & UI for Org Token Policy (User Pays Default)

*   [ ] **Database Schema Update:**
    *   [ ] Add a new field to the `organizations` table (e.g., `token_usage_policy` type: string, values: `'member_tokens'`, `'organization_tokens'`, default: `'member_tokens'`).
    *   [ ] Consider if a corresponding field is needed in `organization_settings` if that's a separate table.
*   [ ] **API Layer:**
    *   [ ] Update API endpoint for fetching organization settings to include the new `token_usage_policy`.
    *   [ ] Update API endpoint for updating organization settings to allow modification of `token_usage_policy`.
*   [ ] **UI - Organization Settings Card:**
    *   [ ] Identify the component rendering the organization settings card (likely in `apps/web/src/components/organization/`).
    *   [ ] Add UI elements (toggle pair) to manage the "Token source for organization chats" setting.
    *   [ ] Initially, the "Organization Tokens" option should be disabled.
    *   [ ] Display an informational message/toast (e.g., "Organization wallets are not yet enabled. Org chats will use member tokens by default.") when "Organization Tokens" is interacted with or hovered over while disabled.
    *   [ ] Connect UI to the store/API to save the `token_usage_policy` setting.
*   [ ] **Store (`organizationStore.ts`):**
    *   [ ] Ensure `userOrganizations` (or the specific org details type) includes the `token_usage_policy` field.
    *   [ ] Update actions for fetching/updating organization settings to handle this new field.
*   [ ] **Define Unified Chat Wallet Determination & User Consent Logic:**
    *   [ ] **Core Decision Logic Function/Selector:**
        *   [ ] Design and implement a centralized function/selector (e.g., in `walletStore` or as a utility) that takes `newChatContext` (orgId or null from `aiStore`) and the specific organization's `token_usage_policy` (from `organizationStore`) as input.
        *   [ ] This logic should determine the *intended* wallet source:
            *   Returns `{ outcome: 'use_personal_wallet' }` if `newChatContext` is `null`.
            *   Returns `{ outcome: 'use_personal_wallet_for_org', orgId }` if `newChatContext` is `orgId` AND `orgTokenPolicy` is `'member_tokens'`.
            *   Returns `{ outcome: 'use_organization_wallet', orgId }` if `newChatContext` is `orgId` AND `orgTokenPolicy` is `'organization_tokens'`.
    *   [ ] **User Consent Mechanism for "Member Tokens" in Org Chat:**
        *   [ ] If Core Decision Logic outcome is `'use_personal_wallet_for_org'`:
            *   [ ] Check for stored user consent for this specific `orgId` (e.g., in `localStorage` keyed by `user_org_token_consent_[orgId]`, or a new user profile field).
            *   [ ] If consent not previously given/stored:
                *   [ ] Trigger a UI popup/modal: "This organization chat will use your personal tokens. [Accept] [Decline]".
                *   [ ] On "Accept": Store consent (e.g., `true`). Allow chat interaction.
                *   [ ] On "Decline": Store refusal (e.g., `false`). Chat input must be disabled (view-only mode for this org chat).
            *   [ ] If consent previously refused: Chat input remains disabled for this org context when personal tokens would be used.
            *   [ ] Provide an "Enable Chat" button that switches the users' choice to consent to using their own tokens if org tokens are unavailable so the user is not permanently locked into an initial decision.
*   [ ] **Initial Chat Feature Adaptation (Using Unified Logic - User Wallet Focus):**
    *   [ ] **`ChatAffordabilityIndicator.tsx`:**
        *   [ ] Consume the Unified Chat Wallet Determination Logic.
        *   [ ] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Display balance from the globally loaded personal wallet (`walletStore.currentWallet`).
        *   [ ] If logic output is `'use_organization_wallet'`: Display "Organization Wallet (Not Yet Available)" or similar, as `walletStore` cannot yet provide this.
        *   [ ] If `'use_personal_wallet_for_org'` AND consent refused: Indicator might show personal balance but chat is disabled.
        *   [ ] The "Enable Chat" button provides user consent and permits chat to occur. 
    *   [ ] **`aiStore.sendMessage` (and subsequent API calls):**
        *   [ ] Consume the Unified Chat Wallet Determination Logic.
        *   [ ] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Ensure API call targets the user's personal wallet for debit.
        *   [ ] If logic output is `'use_organization_wallet'`: Block the send message action (or clearly explain org wallets aren't usable yet), as debiting an org wallet is not yet supported.
        *   [ ] If `'use_personal_wallet_for_org'` AND consent refused: Block the send message action and show the "Enable Chat" button.

## Phase 2: `walletStore` Refactor (Manage Multiple Wallets)

*   [ ] **State Design (`walletStore.ts`):**
    *   [ ] Modify `WalletStateValues` to hold:
        *   `personalWallet: TokenWallet | null` (replaces `currentWallet` for clarity).
        *   `organizationWallets: { [orgId: string]: TokenWallet | null }` (to store fetched org wallets).
        *   `isLoadingPersonalWallet: boolean`.
        *   `isLoadingOrgWallet: { [orgId: string]: boolean }`.
        *   `personalWalletError: ApiErrorType | null`.
        *   `orgWalletErrors: { [orgId: string]: ApiErrorType | null }`.
*   [ ] **Actions (`walletStore.ts`):**
    *   [ ] Rename `loadWallet` to `loadPersonalWallet()` globally (this was the previous `loadWallet(null)`).
    *   [ ] Create `loadOrganizationWallet(organizationId: string)`:
        *   Fetches a specific organization's wallet.
        *   Stores it in `organizationWallets[organizationId]`.
        *   Handles loading and error states for that specific org wallet.
    *   [ ] Consider an action like `getOrLoadOrganizationWallet(organizationId: string)` which returns a cached wallet or loads it if not present.
*   [ ] **Selectors (`walletStore.selectors.ts`):**
    *   [ ] Export existing wallet selectors to the new selector file.
    *   [ ] `selectPersonalWalletBalance()`.
    *   [ ] `selectOrganizationWalletBalance(organizationId: string)`.
    *   [ ] Selectors for loading/error states of personal and specific org wallets.
*   [ ] **Global Load (`App.tsx`):**
    *   [ ] Ensure `AppContent` calls `loadPersonalWallet()` on auth.
*   [ ] **Full Chat Feature Adaptation (Using Unified Logic & Refactored `walletStore`):**
    *   [ ] **`ChatAffordabilityIndicator.tsx`:**
        *   [ ] Consume the Unified Chat Wallet Determination Logic.
        *   [ ] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Display balance from `walletStore.selectPersonalWalletBalance()`.
        *   [ ] If logic output is `'use_organization_wallet'`: Call `walletStore.getOrLoadOrganizationWallet(orgId)` and display balance from `walletStore.selectOrganizationWalletBalance(orgId)`.
    *   [ ] **`aiStore.sendMessage` (and subsequent API calls):**
        *   [ ] Consume the Unified Chat Wallet Determination Logic.
        *   [ ] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Ensure API call targets the user's personal wallet for debit.
        *   [ ] If logic output is `'use_organization_wallet'`: Ensure API call targets the specific organization's wallet (identified by `orgId`) for debit.

## Phase 3: Enabling Organization Wallets (Future)

*   [ ] **Backend/API:**
    *   [ ] Analyze existing tokenWallet and tokenWalletService, this should all be implemented already.
    *   [ ] Functionality for organizations to have their own `TokenWallet` instances.
    *   [ ] Endpoints for crediting/debiting organization wallets.
    *   [ ] Admin UI/process for funding organization wallets.
*   [ ] **UI - Organization Settings Card:**
    *   [ ] Enable the "Use org tokens for org chats" option once an org has a wallet.
    *   [ ] Display organization wallet balance if applicable.
*   [ ] **Chat Logic:**
    *   [ ] Fully activate the logic paths that use the organization's wallet when `token_usage_policy` is `'organization_tokens'` and the org wallet is available (this should be covered by the full adaptation in Phase 2). 

*   [ ] Fix Personal Transaction History page 
*   [ ] Create Org Balance Card & Transaction History page

