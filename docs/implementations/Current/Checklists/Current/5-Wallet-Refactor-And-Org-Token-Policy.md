# Checklist: Wallet Refactor & Organization Token Policy

## Phase 1: Foundation & UI for Org Token Policy (User Pays Default)

*   [x] **Database Schema Update:**
    *   [x] Add a new field to the `organizations` table (e.g., `token_usage_policy` type: string, values: `'member_tokens'`, `'organization_tokens'`, default: `'member_tokens'`).
    *   [x] Consider if a corresponding field is needed in `organization_settings` if that's a separate table.
*   [x] **API Layer:**
    *   [x] Update API endpoint for fetching organization settings to include the new `token_usage_policy`.
    *   [x] Update API endpoint for updating organization settings to allow modification of `token_usage_policy`.
*   [x] **UI - Organization Settings Card:**
    *   [x] Identify the component rendering the organization settings card (likely in `apps/web/src/components/organization/`).
    *   [x] Add UI elements (toggle pair) to manage the "Token source for organization chats" setting.
    *   [x] Initially, the "Organization Tokens" option should be disabled.
    *   [x] Display an informational message/toast (e.g., "Organization wallets are not yet enabled. Org chats will use member tokens by default.") when "Organization Tokens" is interacted with or hovered over while disabled.
    *   [x] Connect UI to the store/API to save the `token_usage_policy` setting.
*   [x] **Store (`organizationStore.ts`):**
    *   [x] Ensure `userOrganizations` (or the specific org details type) includes the `token_usage_policy` field.
    *   [x] Update actions for fetching/updating organization settings to handle this new field.
*   [x] **Define Unified Chat Wallet Determination & User Consent Logic:**
    *   [x] **Core Decision Logic Function/Selector:**
        *   [x] Design and implement a centralized function/selector (e.g., in `walletStore` or as a utility) that takes `newChatContext` (orgId or null from `aiStore`) and the specific organization's `token_usage_policy` (from `organizationStore`) as input.
        *   [x] This logic should determine the *intended* wallet source:
            *   Returns `{ outcome: 'use_personal_wallet' }` if `newChatContext` is `null`.
            *   Returns `{ outcome: 'use_personal_wallet_for_org', orgId }` if `newChatContext` is `orgId` AND `orgTokenPolicy` is `'member_tokens'`.
            *   Returns `{ outcome: 'use_organization_wallet', orgId }` if `newChatContext` is `orgId` AND `orgTokenPolicy` is `'organization_tokens'`.
    *   [x] **User Consent Mechanism for "Member Tokens" in Org Chat:**
        *   [X] If Core Decision Logic outcome is `'use_personal_wallet_for_org'`:
            *   [X] Check for stored user consent for this specific `orgId` (e.g., in `Zustand` keyed by `user_org_token_consent_[orgId]`, or a new user profile field).
            *   [X] If consent not previously given/stored:
                *   [X] Trigger a UI popup/modal: "This organization chat will use your personal tokens. [Accept] [Decline]".
                *   [X] On "Accept": Store consent (e.g., `true`). Allow chat interaction.
                *   [X] On "Decline": Store refusal (e.g., `false`). Chat input must be disabled (view-only mode for this org chat).
            *   [X] If consent previously refused: Chat input remains disabled for this org context when personal tokens would be used.
            *   [X] Provide an "Enable Chat" button that switches the users' choice to consent to using their own tokens if org tokens are unavailable so the user is not permanently locked into an initial decision.
*   [x] **Initial Chat Feature Adaptation (Using Unified Logic - User Wallet Focus):**
    *   [x] **`ChatAffordabilityIndicator.tsx`:**
        *   [x] Consume the Unified Chat Wallet Determination Logic.
        *   [x] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Display balance from the globally loaded personal wallet (`walletStore.currentWallet`).
        *   [x] If logic output is `'use_organization_wallet'`: Display "Organization Wallet (Not Yet Available)" or similar, as `walletStore` cannot yet provide this.
        *   [x] If `'use_personal_wallet_for_org'` AND consent refused: Indicator might show personal balance but chat is disabled.
        *   [x] The "Enable Chat" button provides user consent and permits chat to occur. 
    *   [x] **`aiStore.sendMessage` (and subsequent API calls):**
        *   [x] Consume the Unified Chat Wallet Determination Logic.
        *   [x] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Ensure API call targets the user's personal wallet for debit.
        *   [x] If logic output is `'use_organization_wallet'`: Block the send message action (or clearly explain org wallets aren't usable yet), as debiting an org wallet is not yet supported.
        *   [x] If `'use_personal_wallet_for_org'` AND consent refused: Block the send message action and show the "Enable Chat" button.

## Phase 2: `walletStore` Refactor (Manage Multiple Wallets)

*   [x] **State Design (`walletStore.ts`):**
    *   [x] Modify `WalletStateValues` to hold:
        *   [x] `personalWallet: TokenWallet | null` (replaces `currentWallet` for clarity).
        *   [x] `organizationWallets: { [orgId: string]: TokenWallet | null }` (to store fetched org wallets).
        *   [x] `isLoadingPersonalWallet: boolean`.
        *   [x] `isLoadingOrgWallet: { [orgId: string]: boolean }`.
        *   [x] `personalWalletError: ApiErrorType | null`.
        *   [x] `orgWalletErrors: { [orgId: string]: ApiErrorType | null }`.
*   [x] **Actions (`walletStore.ts`):**
    *   [x] Rename `loadWallet` to `loadPersonalWallet()` globally (this was the previous `loadWallet(null)`).
    *   [x] Create `loadOrganizationWallet(organizationId: string)`:
        *   [x] Fetches a specific organization's wallet.
        *   [x] Stores it in `organizationWallets[organizationId]`.
        *   [x] Handles loading and error states for that specific org wallet.
    *   [x] Consider an action like `getOrLoadOrganizationWallet(organizationId: string)` which returns a cached wallet or loads it if not present.
*   [x] **Selectors (`walletStore.selectors.ts`):**
    *   [x] Export existing wallet selectors to the new selector file.
    *   [x] `selectPersonalWalletBalance()`.
    *   [x] `selectOrganizationWalletBalance(organizationId: string)`.
    *   [x] Selectors for loading/error states of personal and specific org wallets.
*   [x] **Global Load (`App.tsx`):**
    *   [x] Ensure `AppContent` calls `loadPersonalWallet()` on auth.
*   [X] **Full Chat Feature Adaptation (Using Unified Logic & Refactored `walletStore`):**
    *   [X] **`ChatAffordabilityIndicator.tsx`:**
        *   [X] Consume the Unified Chat Wallet Determination Logic.
        *   [X] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Display balance from `walletStore.selectPersonalWalletBalance()`.
        *   [X] If logic output is `'use_organization_wallet'`: Call `walletStore.getOrLoadOrganizationWallet(orgId)` and display balance from `walletStore.selectOrganizationWalletBalance(orgId)`.
    *   [X] **`aiStore.sendMessage` (and subsequent API calls):**
        *   [X] Consume the Unified Chat Wallet Determination Logic.
        *   [X] If logic output is `'use_personal_wallet'` or (`'use_personal_wallet_for_org'` AND consent given): Ensure API call targets the user's personal wallet for debit.
        *   [X] If logic output is `'use_organization_wallet'`: Ensure API call targets the specific organization's wallet (identified by `orgId`) for debit.

## Phase 3: Enabling Organization Wallets (Future)

*   [X] **Backend/API:**
    *   [X] Analyze existing tokenWallet and tokenWalletService, this should all be implemented already.
    *   [X] Functionality for organizations to have their own `TokenWallet` instances.
    *   [X] Endpoints for crediting/debiting organization wallets.
    *   [~] Admin UI/process for funding organization wallets. (Backend capability complete; Dedicated Admin UI not evident)
*   [ ] **UI - Organization Settings Card:** (Actual component: `apps/web/src/components/organizations/OrganizationChatSettings.tsx`)
    *   [ ] Enable the "Use org tokens for org chats" option once an org has a wallet. (Currently hardcoded to disabled in UI)
    *   [ ] Display organization wallet balance if applicable. (Not implemented in `OrganizationChatSettings.tsx`)
*   [ ] **Chat Logic:**
    *   [ ] Fully activate the logic paths that use the organization's wallet when `token_usage_policy` is `'organization_tokens'` and the org wallet is available (this should be covered by the full adaptation in Phase 2). (Blocked by UI settings and `determineChatWallet` returning `org_wallet_not_available_policy_org` instead of `use_organization_wallet`)

*   [ ] Fix Personal Transaction History page (Shows loading spinner but nothing loads or is visible)
*   [ ] Fix Tiktoken / token estimator 
        Server error: Could not estimate token cost or check balance. Unsupported model for token counting: dummy-echo-v1. The tiktoken library could not find an encoding for this model. Original error: Unknown model
*   [ ] Ensure chats debit wallet balance 
*   [ ] Create Org Balance Card & Transaction History page
    *   [~] Org Balance Card (Display in chat context e.g. `WalletSelector.tsx` is partially implemented but blocked by `determineChatWallet` logic; dedicated card for org dashboard/settings not evident)
    *   [ ] Org Transaction History page (Page not implemented, though store can fetch data)

## Phase 4: Dynamic Token Costing & Max Output Calculation

*   [ ] **Define `AiModelExtendedConfig` Interface:**
    *   [ ] Create/update a type definition (e.g., in `packages/types/src/ai.types.ts`) for the `AiModelExtendedConfig` structure to be stored in the `ai_providers.config` JSON column. Include fields for token cost rates, hard caps, tokenization strategy (type, encoding name, char ratio, chatml flag), and any provider-returned limits.
    *   [ ] Set hard_cap at 20% of users token balance or the model providers cap, whichever is smaller. 
*   [ ] **Update `ai_providers` Table & `sync-ai-models` Logic:**
    *   [ ] **Review `DbAiProvider` Interface:** In `supabase/functions/sync-ai-models/index.ts`, ensure the `DbAiProvider` interface (or the fields selected in `getCurrentDbModels`) includes the `config` column if it's to be manipulated during sync.
    *   [ ] **Enhance Provider Sync Functions (`openai_sync.ts`, `anthropic_sync.ts`, `google_sync.ts`):**
        *   [ ] Modify each provider's sync function (`<provider>_sync.ts`) to attempt to extract known token limit information (like `inputTokenLimit`, `outputTokenLimit`) from the provider's API response when listing models.
        *   [ ] Store this extracted information into the `provider_max_input_tokens` and `provider_max_output_tokens` fields within the `config: AiModelExtendedConfig` JSON object for each model in the `ai_providers` table.
        *   [ ] Ensure the sync logic intelligently merges these API-driven fields with any pre-existing manually configured fields in the `config` JSON (i.e., don't wipe out manual settings like `input_token_cost_rate` unless the API is the source for that specific sub-field).
    *   [ ] **Manual `config` Population:**
        *   [ ] For existing models in the `ai_providers` table, manually populate the `config` JSON column with initial default values for:
            *   `input_token_cost_rate` (e.g., 1.0)
            *   `output_token_cost_rate` (e.g., 1.0 or a model-specific multiplier)
            *   `hard_cap_output_tokens` (a sensible default or known model limit)
            *   `tokenization_strategy`:
                *   `type`: (e.g., `'tiktoken'` for OpenAI, `'unknown'` or `'rough_char_count'` for others initially)
                *   `tiktoken_encoding_name`: (e.g., `'cl100k_base'` for relevant OpenAI models)
                *   `is_chatml_model`: (`true` for OpenAI chat models)
                *   `chars_per_token_ratio`: (e.g., 4 if type is `rough_char_count`)
        *   [ ] Document the process for adding new models, emphasizing the need to configure these `config` fields.
*   [ ] **Implement Client-Side Input Token Estimator:**
    *   [ ] **Create `packages/utils/src/tokenCostUtils.ts`:**
        *   [ ] Implement `estimateInputTokens(textOrMessages: string | MessageForTokenCounting[], modelConfig: AiModelExtendedConfig): number`.
            *   This function will use `modelConfig.tokenization_strategy` to decide how to count.
            *   If `type` is `'tiktoken'`, use `tiktoken` library with `modelConfig.tokenization_strategy.tiktoken_encoding_name`. If `is_chatml_model` is true, apply generic ChatML-style counting logic (consider adapting parts of `tokenizer_utils.ts` or making it more generic).
            *   If `type` is `'rough_char_count'`, use `text.length / modelConfig.tokenization_strategy.chars_per_token_ratio`.
            *   Handle cases where `modelConfig` or strategy details are missing (return a high estimate or throw error).
        *   [ ] Export `MessageForTokenCounting` interface if it's not already in a shared types package.
    *   [ ] **Refactor `apps/web/src/hooks/useTokenEstimator.ts`:**
        *   [ ] Modify this hook to retrieve the `AiModelExtendedConfig` for the currently selected AI model (likely from `aiStore` or a new `modelStore` which should load `ai_providers` data).
        *   [ ] Call the new `estimateInputTokens` from `tokenCostUtils.ts`, passing the message content and the model's `config`.
*   [ ] **Implement `getMaxOutputTokens` Function:**
    *   [ ] **In `packages/utils/src/tokenCostUtils.ts`:**
        *   [ ] Implement `getMaxOutputTokens(user_balance_tokens: number, prompt_input_tokens: number, modelConfig: AiModelExtendedConfig, deficit_tokens_allowed: number = 0): number`.
            *   Use `modelConfig.input_token_cost_rate`, `modelConfig.output_token_cost_rate`.
            *   Calculate available budget for output: `budget_for_output = ((user_balance_tokens + deficit_tokens_allowed) - (prompt_input_tokens * modelConfig.input_token_cost_rate))`.
            *   If `budget_for_output <= 0`, return `0`.
            *   Calculate `max_spendable_output_tokens = floor(budget_for_output / modelConfig.output_token_cost_rate)`.
            *   Determine the dynamic hard cap: `dynamic_hard_cap = min(floor(0.20 * user_balance_tokens), modelConfig.hard_cap_output_tokens || Infinity)`. (Use `modelConfig.hard_cap_output_tokens` which is the provider's absolute cap. Ensure `user_balance_tokens` for the 20% calculation is the total current balance).
            *   Clamp result: `max(0, min(max_spendable_output_tokens, dynamic_hard_cap))`.
*   [ ] **Refactor aiStore to export `aiStore.sendMessage` into its own function**
    *   [ ] Import the new independent sub function into aiStore. 
    *   [ ] Refactor, DRY, simplify, flatten aiStore.sendMessage into a DIP/DI adapter interface model to improve readability, testability, and maintainability. 
    *   [ ] Update the aiStore.sendMessage test to test the new external function. 
*   [ ] **Integrate `getMaxOutputTokens` into Chat Sending Logic:**
    *   [ ] **`aiStore.sendMessage` (or equivalent):**
        *   [ ] Before sending a message to the backend:
            *   [ ] Get current user/org wallet balance (`user_balance_tokens`).
            *   [ ] Get the `AiModelExtendedConfig` for the selected model.
            *   [ ] Estimate input tokens for the prompt using `estimateInputTokens(prompt, modelConfig)`.
            *   [ ] Calculate `maxAllowedOutputTokens = getMaxOutputTokens(user_balance_tokens, estimated_input_tokens, modelConfig, chosen_deficit)`.
            *   [ ] If `maxAllowedOutputTokens <= 0`, block the request and inform the user (e.g., "Insufficient balance").
            *   [ ] When calling the backend chat endpoint, pass this `maxAllowedOutputTokens` as a parameter (e.g., `max_tokens_to_generate`).
*   [ ] **Backend Adaptation for `max_tokens_to_generate`:**
    *   [ ] **`supabase/functions/chat/index.ts` (or equivalent handler):**
        *   [ ] Modify the handler to accept the `max_tokens_to_generate` parameter from the client.
        *   [ ] Pass this value to the AI provider adapter's `sendMessage` method.
    *   [ ] **AI Provider Adapters (`openai_adapter.ts`, etc.):**
        *   [ ] Modify the `sendMessage` method in each adapter to accept `max_tokens_to_generate`.
        *   [ ] Use this value to set the appropriate `max_tokens` (or equivalent) parameter in the API call to the specific AI provider.
*   [ ] **Backend Token Usage Verification & Wallet Debit:**
    *   [ ] After receiving a response from the AI provider:
        *   [ ] The backend should still use the actual `prompt_tokens` and `completion_tokens` returned by the provider (or re-calculate them securely on the backend if the provider doesn't return them, using `tokenizer_utils.ts` or provider-specific counting).
        *   [ ] Calculate the *actual cost*: `(actual_prompt_tokens * input_token_cost_rate) + (actual_completion_tokens * output_token_cost_rate)`.
        *   [ ] Debit this actual cost from the user's/org's wallet. This ensures accurate accounting even if client-side estimates were slightly off or the `max_tokens_to_generate` was just a cap.
*   [ ] **Testing:**
    *   [ ] Unit tests for `estimateInputTokens` with various model configs and inputs.
    *   [ ] Unit tests for `getMaxOutputTokens` with different balances, costs, and caps.
    *   [ ] Integration tests for the chat flow, ensuring `max_tokens` is passed and respected, and balances are checked and debited correctly.
    *   [ ] Test with models using different tokenization strategies.
*   [ ] **Documentation:**
    *   [ ] Update developer documentation on how to configure new models in `ai_providers.config`.
    *   [ ] Document the token estimation and cost calculation logic.

