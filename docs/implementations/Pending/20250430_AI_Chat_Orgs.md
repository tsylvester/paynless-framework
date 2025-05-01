### 2.8 Integrate Chat into Orgs 

*   [ ] **Org Chat vs Individual Chat** Create switcher to associate an AI chat with an org or keep it separate. 
*   [ ] **Add Org Chats to Org** Modify Chat History to show Org AI Chat separately.
*   [ ] **Set Chat Access level for Org & Chat** Let members & Orgs set chat access level by role, `member` or `admin`
*   [ ] **Admins Manage AI Chat for Org** Give Admins control over deleting org chats or changing access levels 
        *   [ ] **Approve Access** Org admins can approve/deny members ability to create new org chats 
*   [ ] **Share AI Chats Among Org** All orgId chat histories are shared among chat members with appropriate permissions. 
*   [ ] **Identify Impacted Features:** Chat (`chat_history`, `chats`), potentially User Profile settings if some become org-specific, Subscriptions if they become org-based.
*   [ ] **Update Backend:**
    *   Add `organization_id` FK column to `chats`, `chat_history`.
    *   Update RLS for `chats`, `chat_history` to require `organization_id` matches an active, non-deleted membership.
    *   Apply migrations. Test RLS changes.
*   [ ] **Update API Client (`@paynless/api`):**
    *   Modify `ChatApiClient` functions (`fetchChats`, `fetchChatHistory`, `createChat`, `sendMessage`, etc.) to accept and pass `organizationId`.
    *   Update tests for `ChatApiClient`.
*   [ ] **Update State Management (`@paynless/store`):**
    *   Modify `chatStore` actions to accept `organizationId`.
    *   Modify state structure if needed (e.g., store chats per org: `chatsByOrgId: { [orgId: string]: Chat[] }`).
    *   Update selectors to accept `organizationId` or use `currentOrganizationId` from `organizationStore`.
    *   Update tests for `chatStore`.
*   [ ] **Update Frontend (`apps/web`):**
    *   Modify components using chat features (e.g., `ChatInterface`, `ChatList`) to get `currentOrganizationId` from `organizationStore` and pass it to chat store actions/API calls.
    *   Ensure UI reflects data scoped to the currently selected organization.
    *   Update tests for chat components.
