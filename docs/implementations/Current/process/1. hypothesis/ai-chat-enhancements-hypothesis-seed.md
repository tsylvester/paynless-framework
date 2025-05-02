We're starting a new feature branch on this project and have a casual list of product requirements. We need to transform this into a formal list of product requirements so that we can create a workplan with a full checklist of exact specific detailed ordered steps to follow so that the product is built professionally, reliably, safely, securely, extensibly, and correctly the first time. 

Can you help me transform this list of requirements into a more fulsome, accurate, professional explanation of what we're attempting? 

Once we have an accepted PRD we'll take the next step of making the checklist. 

# AI Chat Improvements

## Integrate Chat into Orgs 

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

## Chat Improvements
*   [ ] Fix homepage to load default choices correctly again
*   [ ] Fix chat history to dynamically add & display new chats in list
*   [ ] Fix auto navigate on replay 
*   [ ] Fix chat to scroll correctly on new submissions 
*   [ ] Save system prompt to chat so it sets correctly when chat loads 
*   [ ] Pass system prompt choice through replay action so it starts chat in the right state 
*   [ ] More interactions for AI chat
    *   [ ] File attachment
    *   [ ] File download 
*   [ ] Chat export for download 
    *   [ ] Chat-to-image
    *   [ ] Select & export sections to a file
*   [ ] Convert to shadcn components
*   [ ] Add loading skeletons
*   [ ] Add error boundaries
*   [ ] Add rewind/reprompt
    *   [ ] User can rewind chat to specific exchange
    *   [ ] User can edit prompt
    *   [ ] User can resubmit prompt 
    *   [ ] Chat history is updated to reflect changed state 
*   [ ] Add markdown support to user prompt submission
*   [ ] Add token tracking for chat
    *   [ ] Estimate tokens for chat submission & display to user 
    *   [ ] Parse token cost for responses & display to user
    *   [ ] Track and display chat token cost (broken out as user, agent, total)
    