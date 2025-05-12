**BEGIN SYNTHESIS SECTION**
**BEGIN SYNTHESIS #1**
# AI Chat Enhancements: Synthesis Document

## Product Requirements Document

### 1. Executive Summary

This project aims to enhance the AI chat functionality within our application by integrating it with the existing organization system and improving the user experience. The enhancements will transform the current individual-centric chat experience into a collaborative tool that can be shared within organizations while maintaining appropriate access controls and improving reliability and functionality.

Given that the application is currently in beta with limited users, we will prioritize core functionality over comprehensive migration strategies, advanced features, and other elements that have been identified for future implementation.

### 2. Problem Statement

Our current AI chat system operates primarily at an individual user level, limiting collaboration opportunities within organizations. Additionally, several UX issues and missing features are impacting user satisfaction and productivity. This project addresses these limitations through two primary initiatives:

1. **Organization Integration**: Enable teams to collaborate through shared AI chats with appropriate access controls
2. **Core Chat Improvements**: Fix existing issues and add essential functionality to enhance user experience

### 3. User Personas

1. **Organization Administrator**: Manages organization settings, members, and controls access to shared chats
2. **Organization Member**: Uses AI chat both individually and collaboratively within their organization
3. **Individual User**: Uses AI chat for personal productivity outside of any organization context

### 4. Detailed Requirements

#### 4.1 Organization Integration

##### 4.1.1 Chat Ownership Model
- **Organization vs. Individual Chat Toggle**
  - Users must be able to create chats associated with an organization or keep them as personal chats
  - UI must clearly indicate the current ownership context of a chat
  - Switching existing chats between personal and organizational ownership is deferred to future implementation

##### 4.1.2 Chat History & Organization
- **Segregated Chat History View**
  - Chat history UI must display organizational chats separately from personal chats
  - Chat history must be filterable by organization when user belongs to multiple organizations
  - UI should provide visual indicators to distinguish between personal and organizational chats

##### 4.1.3 Access Control System
- **Permission Levels**
  - System will support two levels of access: `member` and `admin`
  - Organization admins must have the ability to set default access levels for organization chats
  - Granular, chat-specific permissions are deferred to future implementation
  - Chat creators do not have special permissions beyond their organization role

##### 4.1.4 Administrative Functions
- **Chat Management for Admins**
  - Admins must be able to delete any organizational chat
  - Admins must be able to approve or deny members' ability to create new organizational chats
  - Audit logging for administrative actions is deferred to future implementation

##### 4.1.5 Shared Chat Functionality
- **Collaborative Features**
  - All chat histories with `organization_id` must be visible to authorized members
  - Multiple users may view the same chat at any time
  - Only one user will be permitted to submit responses at a time (active user)
  - All users must have visibility as to who has the chat loaded
  - Each message must have user attribution
  - Browser push notifications for new messages in shared chats
  - Real-time multi-user collaboration (concurrent editing) is deferred to future implementation

#### 4.2 Technical Implementation Requirements

##### 4.2.1 Database Changes
- **Schema Updates**
  - Add `organization_id` foreign key column to `chats` table
  - Implement appropriate indexing strategies for efficient queries
  - Add `system_prompt_id` column to `chats` table for system prompt persistence

##### 4.2.2 Security Enhancements
- **Row-Level Security (RLS)**
  - Update RLS policies to enforce organization-based access control
  - Ensure RLS verifies `organization_id` matches an active, non-deleted membership
  - Implement testing to validate RLS functionality

##### 4.2.3 API Client Updates
- **`@paynless/api` Modifications**
  - Update all `ChatApiClient` functions to accept and utilize `organizationId`
  - Default `organizationId` to `null` for personal chats
  - Add unit tests for updated API client functions

##### 4.2.4 State Management 
- **`@paynless/store` Changes**
  - Restructure `aiStore` to support organization-scoped data
  - Implement organizational context in chat state
  - Update selectors to work with organization context
  - Refactor tests to reduce file sizes and narrow test scopes
  - Refactor `organizationStore` which has become too large

##### 4.2.5 Frontend Integration
- **`apps/web` Updates**
  - Modify all chat components to respect organizational context
  - Ensure UI properly reflects access-controlled data
  - Update component tests to validate organizational scoping

#### 4.3 Chat Experience Improvements

##### 4.3.1 Bug Fixes
- **Critical UX Issues**
  - Fix homepage loading of default choices
  - Fix dynamic updating of chat history list
  - Fix automatic navigation during chat replay
  - Fix chat scrolling behavior with new submissions
    - Scroll to the top of new messages, not the bottom, ensuring users can read from the starting point
  - Ensure system prompts are saved and correctly loaded with chats
  - Fix system prompt handling during replay actions

##### 4.3.2 File Handling
- **Document Interaction (Stretch Goal)**
  - Implement .md file upload functionality
  - Implement .md file download of chat history
  - Other file formats and advanced file handling deferred to future implementation

##### 4.3.3 UI Modernization
- **Component Updates**
  - Convert existing components to shadcn framework
  - Implement loading skeletons for better perceived performance
  - Add error boundaries for graceful failure handling

##### 4.3.4 Chat Revision Features
- **History Management**
  - Implement chat rewind functionality to specific exchanges
  - Allow users to edit previous prompts
  - Support resubmission of modified prompts
  - Upon resubmission, existing chat messages after the edited prompt will be discarded/marked as inactive
  - Add visual indicator in the chat history showing where an edit/rewind occurred
  - Branching chat history is deferred to future implementation

##### 4.3.5 Enhanced Input Options
- **Formatting Support**
  - Add markdown support for user prompt submission
  - Display markdown for submitted responses
  - Real-time markdown preview is deferred to future implementation

##### 4.3.6 Usage Tracking
- **Token Management**
  - Implement token estimation for outgoing submissions
  - Display token counts for AI responses
  - Track and display aggregated token usage statistics
  - Categorize token usage (user, agent, total)

### 5. Non-Functional Requirements

#### 5.1 Usability
- The chat interface, including organization scoping and new features, should be intuitive and easy to use.
- UI elements must clearly communicate the current context (personal vs. organizational).

#### 5.2 Performance
- Chat loading, message sending/receiving, and history updates should feel responsive.
- Token estimation should not significantly delay prompt submission.
- Comprehensive performance tracking and optimization is deferred to future implementation.

#### 5.3 Security
- RBAC for organization chats must be strictly enforced via backend RLS policies.
- All user interactions must be properly authenticated and authorized.
- Privacy considerations and data retention policies are deferred to future implementation.

#### 5.4 Maintainability
- Code should adhere to existing project structures, patterns (API Client Singleton, Store Action Flow Controller), and documentation standards.
- All components should be designed as generic and reusable modules.
- Tests should be comprehensive and follow the RED-GREEN-REFACTOR TDD methodology.

#### 5.5 Extensibility
- The implementation should allow for potential future additions like more granular permissions, real-time collaboration, or support for more file formats.

### 6. Testing Requirements

#### 6.1 Unit Testing
- All new components, functions, and methods must have corresponding unit tests.
- All API client updates must have unit tests for each modified function.
- All store selectors and actions must have unit tests.

#### 6.2 Integration Testing
- Tests must validate proper integration between components, especially for organization context handling.
- Tests must validate RLS policy effectiveness.
- Tests must verify chat functionality in both personal and organizational contexts.

#### 6.3 Analytics
- All user interactions must implement the existing user analytics package (`packages/analytics`).
- Track AI chat usage for monitoring by app administrators.
- Organization-level analytics dashboards are deferred to future implementation.

### 7. User Experience Flow

#### 7.1 Organization Admin Flow
1. Admin creates new organization chat
2. Admin sets default access levels
3. Admin approves member access to chat creation
4. Admin can view, manage, and delete any organizational chat

#### 7.2 Organization Member Flow
1. Member views available organizational chats
2. Member interacts with accessible chats
3. Member can create new chats if approved
4. Member can toggle between personal and organizational contexts

#### 7.3 Individual User Flow
1. User creates and manages personal chats
2. User has clear separation between personal and organizational contexts

### 8. Out of Scope (Deferred to Future Implementation)

1. **Switching Chat Ownership**: Ability to change a chat between personal and organizational ownership
2. **Granular Chat Permissions**: Chat-level permissions beyond organizational roles
3. **Chat Creator Special Privileges**: Special permissions for chat creators
4. **Audit Logging**: Comprehensive audit trails for administrative actions
5. **Real-time Multi-user Collaboration**: Concurrent editing of the same chat
6. **Advanced File Handling**: Support for file formats beyond .md
7. **Extensive Chat Export Options**: Image generation and section selection in exports
8. **Markdown Preview**: Real-time preview of markdown formatting
9. **Mobile-Specific Optimizations**: Dedicated mobile experience enhancements
10. **Performance Optimization**: Comprehensive performance benchmarks and optimizations
11. **Privacy and Data Retention Policies**: Formal policies and controls
12. **Organization-Level Subscriptions**: Billing and subscription management at the organization level
13. **Branching Chat History**: Support for multiple conversation branches
14. **Organization Analytics Dashboard**: Comprehensive usage reporting at the org level

### 9. Success Metrics

The success of this project will be measured by:

1. **User Engagement**: Increase in chat usage within organizations
2. **Collaboration**: Number of shared chats and multi-user interactions
3. **Feature Adoption**: Usage rates of new capabilities
4. **Error Reduction**: Decreased number of reported issues with chat functionality

### 10. Assumptions

1. Users belong to one or more organizations
2. Permissions are enforced both client-side and via RLS on the backend
3. The application is in beta with limited users, making extensive migration strategies unnecessary
4. The application will continue to use individual user subscriptions managed through Stripe
5. The application is primarily web-based at this stage

### 11. Glossary

- **Organization**: A group of users with shared access to resources
- **Chat**: An AI conversation thread containing messages and system context
- **RLS**: Row-Level Security, a database security feature
- **Token**: Unit of text processing in AI models
- **RBAC**: Role-Based Access Control, permission model based on user roles

## Implementation Plan

### Phase 0: Project Setup & Planning

#### 0.1 Project Initialization
- [ ] Create a new feature branch from main
- [ ] Update project documentation to reflect upcoming changes
- [ ] Set up project tracking for implementation progress

#### 0.2 Technical Design Finalization
- [ ] Review database schema changes
- [ ] Finalize API changes
- [ ] Create detailed component architecture diagram
- [ ] Confirm state management approach

#### 0.3 Test Planning
- [ ] Define unit test requirements for all new components
- [ ] Define integration test scenarios for organization integration
- [ ] Set up test fixtures for organization-based testing

### Phase 1: Database & Backend Foundation

#### 1.1 Database Schema Updates
- [ ] Create migration script to add `organization_id` to `chats` table
  - [ ] Define foreign key relationship to `organizations` table
  - [ ] Make field nullable to support personal chats
  - [ ] Add appropriate indexes for efficient querying
- [ ] Create migration script to add `system_prompt_id` to `chats` table
  - [ ] Define foreign key relationship to `system_prompts` table
  - [ ] Make field nullable to support chats without specific prompts
- [ ] Write unit tests for new schema validating constraints
- [ ] Run migration in development environment
- [ ] Verify data integrity after migration
- [ ] Commit schema changes

#### 1.2 Row-Level Security (RLS) Implementation
- [ ] Write unit tests for new RLS policies (RED)
  - [ ] Test personal chat access (user can only access own chats)
  - [ ] Test org chat access (member can access org chats)
  - [ ] Test admin access to org chats
  - [ ] Test unauthorized access scenarios
- [ ] Update RLS policies for `chats` table
  - [ ] Implement policy for SELECT operations
  - [ ] Implement policy for INSERT operations
  - [ ] Implement policy for UPDATE operations
  - [ ] Implement policy for DELETE operations
- [ ] Run unit tests to verify RLS policies (GREEN)
- [ ] Refactor RLS policies for optimization if needed (REFACTOR)
- [ ] Commit RLS policy changes

#### 1.3 Helper Functions & Queries
- [ ] Write unit tests for new helper functions (RED)
- [ ] Create or update database helper functions
  - [ ] Function to check organization membership
  - [ ] Function to validate access permissions
- [ ] Implement optimized queries for retrieving chats by organization
- [ ] Run unit tests to verify helper functions (GREEN)
- [ ] Refactor helper functions for optimization (REFACTOR)
- [ ] Commit helper function changes

### Phase 2: API Layer Implementation

#### 2.1 API Client Updates
- [ ] Write unit tests for updated API client methods (RED)
  - [ ] Test `fetchChats` with organization context
  - [ ] Test `fetchChatHistory` with organization context
  - [ ] Test `createChat` with organization context
  - [ ] Test `sendMessage` with organization context
- [ ] Update `ChatApiClient` in `@paynless/api`
  - [ ] Modify `fetchChats` to accept `organizationId` parameter
  - [ ] Modify `fetchChatHistory` to accept `organizationId` parameter
  - [ ] Modify `createChat` to accept `organizationId` parameter
  - [ ] Modify `sendMessage` to include organization context
- [ ] Run unit tests to verify API client changes (GREEN)
- [ ] Refactor API client for optimization (REFACTOR)
- [ ] Commit API client changes

#### 2.2 Backend Edge Functions
- [ ] Write unit tests for updated edge functions (RED)
- [ ] Update `/chat` edge function
  - [ ] Modify to handle `organizationId` parameter
  - [ ] Implement permission validation
- [ ] Update `/chat-history` edge function
  - [ ] Modify to filter by `organizationId`
  - [ ] Implement permission validation
- [ ] Update `/chat-details` edge function
  - [ ] Modify to include organization information
  - [ ] Implement permission validation
- [ ] Run unit tests to verify edge function changes (GREEN)
- [ ] Refactor edge functions for optimization (REFACTOR)
- [ ] Commit edge function changes

#### 2.3 API Integration Tests
- [ ] Write integration tests for API layer (RED)
  - [ ] Test end-to-end flow for creating an org chat
  - [ ] Test end-to-end flow for accessing org chats
  - [ ] Test permission enforcement
- [ ] Run integration tests to verify API functionality (GREEN)
- [ ] Refactor API implementation based on integration test results (REFACTOR)
- [ ] Commit integration test changes

### Phase 3: State Management Updates

#### 3.1 AI Store Refactoring
- [ ] Write unit tests for updated AI store (RED)
  - [ ] Test state structure with organization context
  - [ ] Test selectors with organization filtering
  - [ ] Test actions with organization parameters
- [ ] Refactor `aiStore` structure
  - [ ] Modify state to include organization context
  - [ ] Update types and interfaces
- [ ] Update `aiStore` selectors
  - [ ] Modify `selectChatHistoryList` to filter by organization
  - [ ] Modify `selectCurrentChatMessages` to respect organization context
  - [ ] Add new selectors for organization-specific functionality
- [ ] Update `aiStore` actions
  - [ ] Modify `startNewChat` to include organization parameter
  - [ ] Modify `sendMessage` to maintain organization context
  - [ ] Modify `loadChatHistory` to filter by organization
- [ ] Run unit tests to verify store changes (GREEN)
- [ ] Refactor store implementation for optimization (REFACTOR)
- [ ] Commit store changes

#### 3.2 Organization Store Updates
- [ ] Write unit tests for updated organization store (RED)
- [ ] Refactor `organizationStore` to reduce size and complexity
  - [ ] Split into multiple smaller, focused modules if necessary
  - [ ] Improve type definitions
- [ ] Add new selectors for organization chat functionality
  - [ ] Selector for current organization's chat permissions
  - [ ] Selector for member's chat creation ability
- [ ] Run unit tests to verify store changes (GREEN)
- [ ] Refactor store implementation for optimization (REFACTOR)
- [ ] Commit store changes

#### 3.3 Store Integration Tests
- [ ] Write integration tests for store interactions (RED)
  - [ ] Test AI store and Organization store coordination
  - [ ] Test state persistence and updates
- [ ] Run integration tests to verify store functionality (GREEN)
- [ ] Refactor store implementation based on integration test results (REFACTOR)
- [ ] Commit integration test changes

### Phase 4: UI Core Components

#### 4.1 Chat Context Switcher
- [ ] Write unit tests for Chat Context Switcher component (RED)
- [ ] Create Chat Context Switcher component
  - [ ] Implement toggle between personal and organization contexts
  - [ ] Display current context clearly
  - [ ] Connect to organization store for organization list
  - [ ] Connect to AI store for context updates
- [ ] Add analytics tracking for context switching
- [ ] Run unit tests to verify component functionality (GREEN)
- [ ] Refactor component for optimization (REFACTOR)
- [ ] Commit component changes

#### 4.2 Chat History List
- [ ] Write unit tests for updated Chat History List component (RED)
- [ ] Update Chat History List component
  - [ ] Modify to display personal and organizational chats separately
  - [ ] Add visual indicators for chat ownership
  - [ ] Implement filtering by organization
  - [ ] Connect to updated selectors from AI store
- [ ] Add analytics tracking for chat selection
- [ ] Run unit tests to verify component functionality (GREEN)
- [ ] Refactor component for optimization (REFACTOR)
- [ ] Commit component changes

#### 4.3 Chat Interface Updates
- [ ] Write unit tests for updated Chat Interface component (RED)
- [ ] Update Chat Interface component
  - [ ] Add organization context display
  - [ ] Show user attribution for messages
  - [ ] Implement chat participant visibility
  - [ ] Connect to updated actions from AI store
- [ ] Add analytics tracking for chat interactions
- [ ] Run unit tests to verify component functionality (GREEN)
- [ ] Refactor component for optimization (REFACTOR)
- [ ] Commit component changes

#### 4.4 Admin Controls
- [ ] Write unit tests for Admin Controls component (RED)
- [ ] Create Admin Controls component
  - [ ] Implement chat deletion functionality for admins
  - [ ] Implement member creation permission controls
  - [ ] Connect to organization store for permission validation
- [ ] Add analytics tracking for admin actions
- [ ] Run unit tests to verify component functionality (GREEN)
- [ ] Refactor component for optimization (REFACTOR)
- [ ] Commit component changes

#### 4.5 UI Integration Tests
- [ ] Write integration tests for UI components (RED)
  - [ ] Test interaction between Chat Context Switcher and Chat History List
  - [ ] Test interaction between Chat History List and Chat Interface
  - [ ] Test Admin Controls in various scenarios
- [ ] Run integration tests to verify UI functionality (GREEN)
- [ ] Refactor UI implementation based on integration test results (REFACTOR)
- [ ] Commit integration test changes

### Phase 5: Bug Fixes Implementation

#### 5.1 Homepage Default Choices
- [ ] Write unit tests for homepage default choices fix (RED)
- [ ] Fix homepage to load default choices correctly
  - [ ] Identify root cause of issue
  - [ ] Implement solution
- [ ] Run unit tests to verify fix (GREEN)
- [ ] Refactor implementation if needed (REFACTOR)
- [ ] Commit changes

#### 5.2 Dynamic Chat History Updates
- [ ] Write unit tests for dynamic chat history updates fix (RED)
- [ ] Fix chat history to dynamically add & display new chats
  - [ ] Identify root cause of issue
  - [ ] Implement solution
- [ ] Run unit tests to verify fix (GREEN)
- [ ] Refactor implementation if needed (REFACTOR)
- [ ] Commit changes

#### 5.3 Auto Navigation on Replay
- [ ] Write unit tests for auto navigation fix (RED)
- [ ] Fix auto navigate on replay
  - [ ] Identify root cause of issue
  - [ ] Implement solution
- [ ] Run unit tests to verify fix (GREEN)
- [ ] Refactor implementation if needed (REFACTOR)
- [ ] Commit changes

#### 5.4 Chat Scrolling
- [ ] Write unit tests for chat scrolling fix (RED)
- [ ] Fix chat to scroll correctly on new submissions
  - [ ] Ensure scrolling to the top of new messages, not the bottom
  - [ ] Identify root cause of issue
  - [ ] Implement solution
- [ ] Run unit tests to verify fix (GREEN)
- [ ] Refactor implementation if needed (REFACTOR)
- [ ] Commit changes

#### 5.5 System Prompt Persistence
- [ ] Write unit tests for system prompt persistence fix (RED)
- [ ] Save system prompt to chat so it sets correctly when chat loads
  - [ ] Identify root cause of issue
  - [ ] Implement solution using the new `system_prompt_id` column
- [ ] Run unit tests to verify fix (GREEN)
- [ ] Refactor implementation if needed (REFACTOR)
- [ ] Commit changes

#### 5.6 System Prompt on Replay
- [ ] Write unit tests for system prompt on replay fix (RED)
- [ ] Pass system prompt choice through replay action
  - [ ] Identify root cause of issue
  - [ ] Implement solution
- [ ] Run unit tests to verify fix (GREEN)
- [ ] Refactor implementation if needed (REFACTOR)
- [ ] Commit changes

### Phase 6: UI Modernization

#### 6.1 ShadCN Component Conversion
- [ ] Write unit tests for ShadCN components (RED)
- [ ] Convert chat components to ShadCN framework
  - [ ] Identify all components needing conversion
  - [ ] Convert components one by one
  - [ ] Ensure consistent styling
- [ ] Run unit tests to verify component functionality (GREEN)
- [ ] Refactor components for optimization (REFACTOR)
- [ ] Commit component changes

#### 6.2 Loading Skeletons
- [ ] Write unit tests for loading skeleton components (RED)
- [ ] Add loading skeletons to chat interface
  - [ ] Implement for chat history list
  - [ ] Implement for chat message display
  - [ ] Implement for provider/prompt selection
- [ ] Run unit tests to verify loading behavior (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

#### 6.3 Error Boundaries
- [ ] Write unit tests for error boundary components (RED)
- [ ] Add error boundaries to chat components
  - [ ] Implement for main chat interface
  - [ ] Implement for chat history list
  - [ ] Create error fallback components
- [ ] Run unit tests to verify error handling (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

### Phase 7: Advanced Features Implementation

#### 7.1 Markdown Support
- [ ] Write unit tests for markdown support (RED)
- [ ] Add markdown support to user prompt submission
  - [ ] Implement markdown parsing
  - [ ] Implement markdown rendering for submitted responses
  - [ ] Connect to chat interface
- [ ] Run unit tests to verify markdown functionality (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

#### 7.2 Token Tracking
- [ ] Write unit tests for token tracking features (RED)
- [ ] Implement token estimation for chat submission
  - [ ] Integrate client-side tokenizer library
  - [ ] Display estimated token count to user
- [ ] Implement token cost parsing for responses
  - [ ] Extract token usage from AI provider responses
  - [ ] Store token usage with message
  - [ ] Display token count for each response
- [ ] Implement chat token cost tracking
  - [ ] Calculate and display user tokens
  - [ ] Calculate and display agent tokens
  - [ ] Calculate and display total tokens
- [ ] Run unit tests to verify token tracking (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

#### 7.3 Chat Rewind/Reprompt
- [ ] Write unit tests for chat rewind/reprompt functionality (RED)
- [ ] Implement chat rewind functionality
  - [ ] Add UI for selecting previous exchange
  - [ ] Implement prompt editing
  - [ ] Update database schema if needed to track active/inactive messages
- [ ] Implement reprompt functionality
  - [ ] Submit edited prompt to AI
  - [ ] Handle replacement of subsequent history
  - [ ] Add visual indicators for edited exchanges
- [ ] Run unit tests to verify rewind/reprompt functionality (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

#### 7.4 Notification System
- [ ] Write unit tests for notification system (RED)
- [ ] Implement browser push notifications
  - [ ] Create notification service
  - [ ] Implement permission request
  - [ ] Connect to chat message events
- [ ] Run unit tests to verify notification functionality (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

### Phase 8: Stretch Goals (If Time Permits)

#### 8.1 Markdown File Upload
- [ ] Write unit tests for markdown file upload (RED)
- [ ] Implement markdown file upload functionality
  - [ ] Create file upload component
  - [ ] Implement file validation
  - [ ] Connect to chat interface
- [ ] Run unit tests to verify file upload functionality (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

#### 8.2 Markdown Chat Export
- [ ] Write unit tests for markdown chat export (RED)
- [ ] Implement markdown chat export functionality
  - [ ] Create export service
  - [ ] Generate markdown from chat history
  - [ ] Implement download mechanism
- [ ] Run unit tests to verify export functionality (GREEN)
- [ ] Refactor implementation for optimization (REFACTOR)
- [ ] Commit changes

### Phase 9: Integration, Testing & Finalization

#### 9.1 Comprehensive Integration Testing
- [ ] Write end-to-end integration tests (RED)
  - [ ] Test complete user flows for organization admins
  - [ ] Test complete user flows for organization members
  - [ ] Test complete user flows for individual users
- [ ] Run end-to-end tests to verify application functionality (GREEN)
- [ ] Refactor implementation based on test results (REFACTOR)
- [ ] Commit integration test changes

#### 9.2 Analytics Integration
- [ ] Implement analytics tracking for all new features
  - [ ] Track organization chat creation
  - [ ] Track organization chat usage
  - [ ] Track feature adoption
- [ ] Verify analytics data collection
- [ ] Commit analytics changes

#### 9.3 Documentation
- [ ] Update API documentation
- [ ] Update component documentation
- [ ] Create user guide for new features
- [ ] Document future work items identified during implementation
- [ ] Commit documentation changes

#### 9.4 Final Review & Deployment
- [ ] Conduct code review of all changes
- [ ] Perform final integration testing
- [ ] Prepare release notes
- [ ] Merge feature branch to main
- [ ] Deploy to staging environment
- [ ] Verify functionality in staging
- [ ] Deploy to production

### Phase 10: Post-Implementation

#### 10.1 Monitoring & Support
- [ ] Monitor application for issues
- [ ] Address any critical bugs
- [ ] Collect user feedback

#### 10.2 Future Work Planning
- [ ] Document all deferred features for future implementation
- [ ] Prioritize future work based on user feedback
- [ ] Create tickets for future implementation phases
**END SYNTHESIS #1**

**BEGIN SYNTHESIS #2**
# AI Chat Enhancements: Synthesized Product Requirements Document & Implementation Plan

This document represents the synthesis of multiple initial requirement documents (Hypotheses), critical analyses (Antitheses), and user feedback. It serves as the definitive guide for the AI Chat Enhancement project, outlining the agreed-upon scope, features, and implementation approach.

---

# Part 1: Product Requirements Document (PRD)

## 1. Overview & Executive Summary

This project enhances the AI Chat feature within the Paynless Framework. The primary goals are:

1.  **Organization Integration:** Integrate AI chat capabilities with the multi-tenancy (Organizations) system, allowing chats to be associated with, managed by, and viewed within specific organizational contexts, fostering collaboration.
2.  **Core Chat Improvements:** Implement significant functional and user experience improvements to the chat interface, addressing known issues and adding highly requested features to create a more robust, reliable, and user-friendly AI interaction experience.

This PRD defines the scope for the initial implementation phase, focusing on core organizational integration and essential chat enhancements, while explicitly deferring more complex features like real-time collaboration, advanced permissions, and organization-level billing to future phases.

## 2. Problem Statement

The current AI chat system primarily operates at an individual user level, lacking features for team collaboration within organizations. Furthermore, several user experience shortcomings and functional bugs hinder user satisfaction and productivity. This project directly addresses these issues by:

1.  Enabling organization-scoped chats with basic role-based access control.
2.  Fixing critical bugs related to chat history, state management, and UI behavior.
3.  Introducing key enhancements like markdown support, token tracking, and chat rewind functionality.

## 3. User Personas

These personas guide the design and prioritization of features:

1.  **Organization Administrator (`admin` role):** Manages organization settings, members, and controls specific aspects of organizational chat usage (e.g., enabling/disabling member creation). Needs visibility into org chats and basic management capabilities.
2.  **Organization Member (`member` role):** Uses AI chat for individual productivity and collaboratively within their organization. Needs to view shared organizational chats and create them if permitted by the admin.
3.  **Individual User (No specific org context):** Uses AI chat for personal productivity outside of any organization context. Benefits from general UX improvements and new features.

## 4. Detailed Requirements

### 4.1 Organization Integration

**REQ-ORG-1: Chat Context Association**

*   **REQ-ORG-1.1:** Users MUST be able to explicitly select the context (Personal or a specific accessible Organization) when initiating a *new* chat session.
    *   *Implementation Detail:* A UI element (e.g., a dropdown/selector integrated near the 'New Chat' button or initial prompt area) must allow this selection *before* the first message is sent.
*   **REQ-ORG-1.2:** The UI MUST clearly and persistently display the current context (Personal or specific Organization Name) associated with the *active* chat session.
    *   *Implementation Detail:* Display the context prominently within the main chat interface (e.g., near the chat title or header).
*   **REQ-ORG-1.3:** Default Context: When a user initiates a new chat, the context selector SHOULD default to 'Personal' unless an Organization context is actively selected in the application's global state (e.g., via the `OrganizationSwitcher`).

**REQ-ORG-2: Segregated Chat History**

*   **REQ-ORG-2.1:** The Chat History UI MUST present Personal chats and Organization chats in distinct, clearly labeled sections or views.
    *   *Implementation Detail:* Utilize Tabs, separate collapsible sections, or a similar clear visual separation within the chat history panel.
*   **REQ-ORG-2.2:** Chats listed under an Organization section MUST only display chats associated with the currently selected Organization context (as determined by the global `OrganizationSwitcher` or equivalent state).
*   **REQ-ORG-2.3:** Individual chat entries in the history list MUST have clear visual indicators of their context (e.g., an organization icon/name prefix for org chats, potentially a user icon for personal chats).
*   **REQ-ORG-2.4:** For users belonging to multiple organizations, the UI MUST provide a mechanism (e.g., filtering integrated with the `OrganizationSwitcher`) to easily view chats associated with a specific selected organization.

**REQ-RBAC-1: Role-Based Access Control (RBAC) & Permissions (V1 Scope)**

*   **REQ-RBAC-1.1:** Permissions for Organization Chats are determined by the user's role (`organization_members.role`) within that specific organization:
    *   **`admin` Role:** Can View *All* Chats associated with their Organization, Create *New* Org Chats, Delete *Any* Org Chat associated with their Organization, Manage Member Chat Creation Permissions (see REQ-ADMIN-1.2).
    *   **`member` Role:** Can View *All* Chats associated with their Organization, Create *New* Org Chats (*only if* enabled by an Admin via REQ-ADMIN-1.2).
    *   *(Note: Editing/Deleting specific messages within a chat is handled by REQ-UX-5 related to Rewind/Reprompt and applies based on message authorship, not org role).*
*   **REQ-RBAC-1.2:** Access to view or interact with an Organization Chat requires the user to have an `active` status in the `organization_members` table for the corresponding `organization_id`.
*   **REQ-RBAC-1.3:** Row-Level Security (RLS) policies MUST enforce these permissions at the database level for the `chats` table. Access control must primarily rely on backend enforcement via RLS.

**REQ-ADMIN-1: Admin Management Controls (V1 Scope)**

*   **REQ-ADMIN-1.1:** Users with the 'admin' role for an organization MUST have a UI mechanism to Delete any chat associated with that organization.
    *   *Implementation Detail:* This could be an option in the chat history list item context menu or within the chat interface itself for org chats. A confirmation dialog MUST be implemented.
*   **REQ-ADMIN-1.2:** Implement a mechanism within the Organization Settings UI allowing Admins to toggle (enable/disable) the ability for users with the 'member' role to create *new* chats associated with that organization.
    *   *Implementation Detail:* Requires a new boolean column in the `organizations` table (e.g., `allow_member_chat_creation`, defaulting to `true`) and corresponding UI controls in the org settings page.

**REQ-SHARED-1: Shared Org Chat Visibility (Asynchronous V1 Scope)**

*   **REQ-SHARED-1.1:** All active members of an organization MUST be able to view the complete message history of chats associated with that organization, consistent with their role permissions (REQ-RBAC-1.1). Viewing is asynchronous; real-time multi-user interaction within a single session is out of scope for V1.
    *   *Implementation Detail:* Selecting an org chat loads its current history. Updates made by others require a refresh or reload of the chat (manual or potentially via background polling/basic Supabase Realtime subscription triggers for invalidation).

### 4.2 Technical Implementation Requirements

**REQ-TECH-1: Database Schema Changes**

*   **REQ-TECH-1.1:** Add `organization_id UUID NULLABLE REFERENCES public.organizations(id) ON DELETE SET NULL` to the `public.chats` table. Add an index on `organization_id`.
*   **REQ-TECH-1.2:** Add `system_prompt_id UUID NULLABLE REFERENCES public.system_prompts(id) ON DELETE SET NULL` to the `public.chats` table. (Supports REQ-UX-1.5).
*   **REQ-TECH-1.3:** Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true` to the `public.organizations` table. (Supports REQ-ADMIN-1.2).
*   **REQ-TECH-1.4:** Potentially add columns/flags to `public.chat_messages` to support the Rewind/Reprompt feature (REQ-UX-5), such as `is_active_in_thread BOOLEAN NOT NULL DEFAULT true`. Needs confirmation during implementation design.

**REQ-TECH-2: Security (RLS)**

*   **REQ-TECH-2.1:** Implement/Update RLS policies on the `public.chats` table:
    *   `SELECT`: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if `public.is_org_member(organization_id, auth.uid(), 'active')`.
    *   `INSERT`: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if (`public.is_org_member(organization_id, auth.uid(), 'active')` AND (`public.get_user_role(auth.uid(), organization_id) = 'admin'` OR (`public.get_user_role(auth.uid(), organization_id) = 'member'` AND `(SELECT allow_member_chat_creation FROM public.organizations WHERE id = organization_id)`))). Requires helper functions `is_org_member` and `get_user_role`.
    *   `DELETE`: Allow if `organization_id` IS NULL AND `user_id` = `auth.uid()`, OR if (`public.is_org_member(organization_id, auth.uid(), 'active')` AND `public.get_user_role(auth.uid(), organization_id) = 'admin'`).
    *   `UPDATE`: Define based on editable fields. If only `system_prompt_id` or chat title is editable, define rules based on ownership/admin role.
*   **REQ-TECH-2.2:** Review RLS on `public.chat_messages` to ensure access is implicitly granted only if the user has SELECT access to the parent `chat` record (via `chat_id`). Direct modification rules might be needed for Rewind/Reprompt.
*   **REQ-TECH-2.3:** Develop and implement automated tests (e.g., using pgTAP or equivalent) specifically validating the RLS policies for `chats` and `chat_messages` under various user/org/role scenarios.

**REQ-TECH-3: API Client (`@paynless/api`)**

*   **REQ-TECH-3.1:** Update relevant methods in `AiApiClient` (`packages/api/src/ai.api.ts`) - e.g., `sendMessage`, `getChats`, `getChatDetails`, `createChat`, `deleteChat` - to accept an optional `organizationId: string | null` parameter.
*   **REQ-TECH-3.2:** Update corresponding backend Edge Functions (e.g., `/chat`, `/chats`, `/chat/[chatId]`) to:
    *   Receive the optional `organizationId`.
    *   Filter database queries based on `organizationId` AND the authenticated `user_id`'s RLS-verified access.
    *   Handle `null` `organizationId` as requests for personal chats (`organization_id IS NULL AND user_id = auth.uid()`).
    *   Enforce permissions for actions like creation (checking `allow_member_chat_creation`) and deletion (checking admin role) via RLS implicitly, but potentially add explicit checks for clarity/error handling.

**REQ-TECH-4: State Management (`@paynless/store`)**

*   **REQ-TECH-4.1:** Refactor `useAiStore` (`packages/store/src/aiStore.ts`) state and actions:
    *   Modify state structure to effectively manage and cache chats based on context (personal vs. organization ID). Consider structures like `{ personalChats: Chat[], orgChats: { [orgId: string]: Chat[] } }`.
    *   Ensure state efficiently retrieves `currentOrganizationId` from `useOrganizationStore` when needed.
    *   Update actions (`sendMessage`, `loadChats`, `loadChatDetails`, `startNewChat`, `deleteChat`) to accept and utilize the `organizationId` context parameter, passing it to API calls.
    *   Update selectors (`selectChatHistoryList`, `selectCurrentChatMessages`) to return data relevant to the current context (Personal or the selected `currentOrganizationId`).
*   **REQ-TECH-4.2:** Refactor `useOrganizationStore` if it has become too large or complex, potentially splitting state/actions into more focused stores if necessary.
*   **REQ-TECH-4.3:** Update/Refactor tests for `useAiStore` and `useOrganizationStore` to reflect the changes, improve clarity, potentially reduce file size, and ensure correct handling of the organizational context.

**REQ-TECH-5: Frontend Integration (`apps/web`)**

*   **REQ-TECH-5.1:** Update relevant frontend components (`AiChat.tsx`, `ChatHistory.tsx`, etc.) to:
    *   Source the `currentOrganizationId` from `useOrganizationStore`.
    *   Pass the correct `organizationId` (or `null` for personal) to store actions and API client calls.
    *   Implement the UI for selecting chat context (REQ-ORG-1.1).
    *   Implement the UI for displaying chat context (REQ-ORG-1.2).
    *   Implement the UI for segregated chat history (REQ-ORG-2).
    *   Conditionally render UI elements (e.g., delete button for org chats) based on user role (`admin`/`member`) obtained via `useOrganizationStore`.
*   **REQ-TECH-5.2:** Ensure UI elements dynamically reflect the current org context and update correctly when the global organization context changes.

**REQ-TECH-6: Analytics (`@paynless/analytics`)**

*   **REQ-TECH-6.1:** Integrate analytics tracking for key user interactions related to the new features:
    *   Event: `new_chat_created` (Properties: `context: 'personal' | 'organization'`, `organizationId?: string`)
    *   Event: `chat_deleted` (Properties: `context: 'personal' | 'organization'`, `deletedByRole: 'owner' | 'admin'`)
    *   Event: `chat_context_selected` (Properties: `selectedContext: 'personal' | 'organization'`, `organizationId?: string`)
    *   Event: `chat_rewind_used` (Properties: `chatId: string`)
    *   Event: `token_usage_displayed` (Track impressions or interactions with token display elements)
    *   Event: `member_chat_creation_toggled` (Properties: `organizationId: string`, `enabled: boolean`)

### 4.3 Chat Experience Improvements

**REQ-UX-1: Core Behavior Fixes & Improvements**

*   **REQ-UX-1.1:** Ensure the main chat interface consistently loads with the correct default AI provider and system prompt selections pre-filled as per system configuration or user preferences.
*   **REQ-UX-1.2:** The chat history list MUST update automatically (without requiring a manual page refresh) to show newly created chats relevant to the current view (Personal or selected Org).
    *   *Implementation Detail:* Utilize store updates triggered by successful chat creation API calls, potentially augmented by Supabase Realtime subscriptions for cache invalidation if needed for robustness.
*   **REQ-UX-1.3:** Selecting a past chat from the history MUST reliably navigate the user to the main chat interface and load the selected chat's state (messages, context, associated system prompt).
*   **REQ-UX-1.4:** The chat message display area MUST automatically scroll smoothly to show the *top* of the latest message(s) upon submission of a user prompt or receipt of new AI response(s), ensuring the beginning of the new content is immediately visible.
*   **REQ-UX-1.5:** The system prompt selected/used at the *beginning* of a chat session MUST be saved and associated with that specific chat instance (see REQ-TECH-1.2). When loading a previous chat, the correct system prompt must be automatically restored and used for subsequent interactions in that chat.
*   **REQ-UX-1.6:** When selecting ("replaying") a chat from history, the associated system prompt (loaded from the chat data) MUST be correctly passed to the chat interface logic and subsequent API calls for that session.

**REQ-UX-2: UI Standardization & Quality**

*   **REQ-UX-2.1:** Refactor existing AI chat UI components (e.g., main interface, history list, message bubbles, input area) to utilize standard `shadcn/ui` library components where appropriate, ensuring visual consistency with the rest of the application.
*   **REQ-UX-2.2:** Implement loading skeletons (`shadcn/ui Skeleton`) for:
    *   Chat history list during initial load or context switch.
    *   Chat message display area during initial load of a chat.
    *   Potentially provider/prompt selection lists if applicable.
*   **REQ-UX-2.3:** Use appropriate loading indicators (e.g., spinners within buttons, disabled states) on controls during asynchronous operations like message submission, AI response generation, and chat deletion.
*   **REQ-UX-2.4:** Implement React Error Boundaries around the main chat interface component tree and the chat history list component to gracefully handle rendering errors and prevent catastrophic UI crashes, providing a fallback UI or error message.

**REQ-UX-3: Markdown Support**

*   **REQ-UX-3.1:** The user input area for chat prompts SHOULD allow users to type standard Markdown syntax.
*   **REQ-UX-3.2:** Displayed user messages *and* AI assistant messages in the chat history MUST render basic Markdown formatting appropriately (e.g., bold, italics, lists, code blocks, links).
    *   *Implementation Detail:* Use a suitable Markdown rendering library (e.g., `react-markdown`) for displaying message content. Ensure sanitization practices are followed. The raw text sent to the AI should be the plain Markdown text.

**REQ-UX-4: Token Usage Tracking & Display**

*   **REQ-UX-4.1:** Integrate a client-side tokenizer library (compatible with the primary AI models used, e.g., `tiktoken` for OpenAI models) to estimate the token count of the user's prompt *before* submission.
*   **REQ-UX-4.2:** Display this estimated token count near the prompt input area, updating dynamically as the user types.
*   **REQ-UX-4.3:** The backend (`/chat` Edge Function) MUST attempt to parse token usage information (e.g., `prompt_tokens`, `completion_tokens`) returned by the AI provider's API response.
*   **REQ-UX-4.4:** This token usage data MUST be saved alongside the corresponding `assistant` role `chat_messages` record, likely within its existing `metadata` or a dedicated `token_usage` JSONB column.
*   **REQ-UX-4.5:** The UI MUST display the actual token count (e.g., "Completion: N tokens") associated with each AI assistant message in the chat history view.
*   **REQ-UX-4.6:** The UI MUST track and display the cumulative token usage for the current, active chat session, categorized as User Prompt Tokens, Assistant Completion Tokens, and Total Tokens.
    *   *Implementation Detail:* Define a clear UI location for this cumulative display (e.g., a footer, a chat info panel). Calculation should occur client-side based on loaded message data.

**REQ-UX-5: Chat Rewind/Reprompt Functionality (V1 - Replace History)**

*   **REQ-UX-5.1:** Provide a UI mechanism allowing users to select a specific *previous user prompt* within the current chat session's history.
*   **REQ-UX-5.2:** Upon selection, populate the main chat input area with the content of the selected user prompt, allowing the user to edit it.
*   **REQ-UX-5.3:** Provide a clear "Resubmit" or equivalent action trigger.
*   **REQ-UX-5.4:** Upon resubmission:
    *   The API call (`sendMessage`) must include the history *up to and including* the edited prompt.
    *   The backend/database must handle this by effectively marking all subsequent messages in that chat thread as inactive or deleting them. *(Requires careful implementation, possibly using the `is_active_in_thread` flag from REQ-TECH-1.4 or managing message history arrays)*.
    *   New AI responses generated from the resubmitted prompt will form the new end of the active chat thread.
*   **REQ-UX-5.5:** Consider adding a subtle visual indicator in the chat history UI (e.g., an icon or separator line) to show where an edit/rewind point occurred.

**REQ-UX-6: File Handling (.md Upload/Download - Stretch Goal)**

*   **REQ-UX-6.1 (Stretch):** If primary goals are met, investigate and potentially implement functionality for users to upload a single `.md` (Markdown) file alongside their prompt.
    *   *Considerations:* Requires UI for file selection, secure upload mechanism (e.g., to Supabase Storage), associating the file with the message, potentially passing file content/link to the AI. Scope limited strictly to `.md` files.
*   **REQ-UX-6.2 (Stretch):** If primary goals are met, investigate and potentially implement functionality for users to download the current chat conversation history as a single `.md` file.
    *   *Considerations:* Requires client-side generation of the Markdown content from chat messages and a download trigger mechanism.

## 5. Non-Functional Requirements

*   **Usability:** The interface for selecting context, viewing history, and using new features must be intuitive.
*   **Performance:** Chat loading, message sending/receiving, history updates, and token estimation should feel responsive. No specific benchmarks defined for V1, but avoid introducing noticeable lag.
*   **Security:** RBAC for organization chats must be strictly enforced via backend RLS. UI should reflect permissions accurately but not be the sole gatekeeper.
*   **Maintainability:** Code must adhere to existing project structures, patterns (API Client Singleton, Store patterns), `DEV_PLAN.md` standards, and include appropriate documentation (TSDoc, component comments). Use TypeScript effectively.
*   **Extensibility:** Implementation should allow for future additions like more granular permissions, real-time collaboration features, and different export formats without requiring complete rewrites. Design components and state management with this in mind.

## 6. Assumptions

*   The Organizations feature (creating orgs, inviting members, roles) is functional and stable.
*   `useOrganizationStore` provides necessary data like current organization, user roles within organizations, and lists of organizations the user belongs to.
*   RLS helper functions (`is_org_member`, `get_user_role`) exist or will be created.
*   Users primarily interact with one organizational context at a time, managed via a global switcher.
*   The application is currently in beta; complex data migration strategies for existing chats are not a V1 priority.
*   Existing AI provider integrations are functional and return token usage information where available.

## 7. Out of Scope (for this Implementation Phase)

*   **Real-time Collaboration:** Multiple users concurrently editing/viewing the *same* chat session with live updates (typing indicators, instant message appearance) is explicitly out of scope. V1 is asynchronous viewing.
*   **Granular Chat Permissions:** Setting permissions on individual chats beyond the organization role is out of scope.
*   **Chat Ownership Switching:** Migrating an existing chat between Personal and Org contexts (or vice-versa) is out of scope.
*   **Advanced Audit Logging:** Detailed audit trails for chat actions beyond standard application logging are out of scope.
*   **Organization-Level Billing/Subscriptions:** Integration with billing based on org chat usage is out of scope. Existing user-based subscriptions apply.
*   **Advanced File Handling:** Support for file types other than `.md` (Stretch Goal), folder uploads, or AI processing of file content is out of scope.
*   **Advanced Chat Export:** Export formats other than `.md` (Stretch Goal), image generation, or complex section selection are out of scope.
*   **Real-time Markdown Preview:** Live preview rendering in the input box as the user types Markdown is out of scope.
*   **Mobile-Specific Optimizations:** Dedicated mobile UI/UX flows beyond basic responsive design are out of scope.
*   **Advanced Scalability/Performance Testing:** Formal load testing and architectural changes for very large organizations are out of scope.
*   **Organization-Facing Analytics Dashboard:** Dashboards for admins to view org chat usage statistics are out of scope.
*   **Cross-Browser/Device Testing:** Formal testing beyond primary development browsers is out of scope.
*   **User Acceptance Testing (UAT):** Formal UAT processes are out of scope for this phase.

## 8. Dependencies

*   Functional Supabase backend with Auth, Database (Postgres), Edge Functions, and potentially Storage/Realtime.
*   Existing Organizations feature implementation.
*   `@paynless/api` client library.
*   `@paynless/store` (Zustand) state management library, specifically `useOrganizationStore` and `useAiStore`.
*   `@paynless/analytics` client library.
*   `shadcn/ui` component library.
*   Client-side tokenization library (e.g., `tiktoken`).
*   Markdown rendering library (e.g., `react-markdown`).

## 9. Risks & Mitigation Strategies

| Risk                                    | Impact | Probability | Mitigation                                                                                                                               |
| :-------------------------------------- | :----- | :---------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| RLS Complexity Leads to Security Flaws  | High   | Medium      | Implement thorough RLS tests (REQ-TECH-2.3). Perform manual security reviews of RLS policies. Prioritize backend enforcement.                |
| State Management Refactor Introduces Bugs | Medium | Medium      | Write comprehensive unit/integration tests for store selectors and actions *before* refactoring. Refactor incrementally. Use TypeScript types strictly. |
| UI Changes Confuse Users                | Low    | Medium      | Provide clear visual cues for context switching and org chats. Ensure UI consistency. Use analytics to monitor feature adoption.             |
| Rewind/Reprompt Data Handling is Flawed | Medium | Medium      | Carefully design the data model/logic for marking messages inactive. Test edge cases thoroughly (rewinding multiple times, empty history). |
| Token Estimation Inaccuracy             | Low    | Medium      | Use a reliable library (`tiktoken`). Clearly label counts as estimates. Primarily rely on *actual* usage returned from the API.           |
| Scope Creep from Deferred Features      | Medium | Low         | Maintain a clear backlog of deferred items. Strictly adhere to the "Out of Scope" section for this phase.                                    |
| Performance Degradation in Chat History | Medium | Low         | Implement efficient state selectors. Consider virtualization for very long chat lists if initial implementation proves slow (future optimization). |

## 10. Glossary

*   **AI Chat:** The feature allowing users to interact with Large Language Models.
*   **Organization:** A tenant in the multi-tenancy system, grouping users.
*   **Context:** The scope of a chat session, either 'Personal' or associated with a specific 'Organization'.
*   **Chat History:** The list of past chat sessions accessible to the user.
*   **RBAC:** Role-Based Access Control. Permissions based on user roles (e.g., `admin`, `member`) within an organization.
*   **RLS:** Row-Level Security. Database feature restricting data access based on policies.
*   **Token:** Unit of text processing used by AI models for input/output measurement.
*   **System Prompt:** Initial instruction given to the AI model to set context or persona for a chat session.
*   **Rewind/Reprompt:** Feature allowing users to go back, edit a previous prompt, and restart the conversation from that point.
*   **shadcn/ui:** The component library used in the project.
*   **Store:** State management container (using Zustand).
*   **API Client:** Library (`@paynless/api`) for frontend-backend communication.

## 11. Success Metrics (V1 Focus)

*   **Feature Adoption:**
    *   % of active users creating at least one Organization chat within 30 days of launch.
    *   Frequency of use for the Rewind/Reprompt feature (measured by analytics event `chat_rewind_used`).
    *   Frequency of interaction with token usage display elements.
*   **Engagement:**
    *   Increase in the average number of chat messages sent per active user (compare pre/post launch).
    *   Increase in the number of unique chats created per active user.
*   **Quality & Reliability:**
    *   Reduction in user-reported bugs related to chat history loading, scrolling, and state persistence.
    *   Error rate monitoring (via Sentry/equivalent) for chat-related components and API endpoints.
*   **Admin Controls:**
    *   Adoption rate of the "Allow Member Chat Creation" setting by Organization Admins.

---

# Part 2: Implementation Plan & Checklist

This plan follows a Test-Driven Development (TDD) approach (Red-Green-Refactor) and respects the project's architecture (Backend ↔ API ↔ Store ↔ Frontend). Checkpoints are included for testing, refactoring, and committing work.

**Legend:**

*   **[DB]:** Database Schema Change (Migration)
*   **[BE]:** Backend Logic (Edge Function / RLS / Helpers)
*   **[API]:** API Client Library (`@paynless/api`)
*   **[STORE]:** State Management (`@paynless/store`)
*   **[UI]:** Frontend Component (`apps/web`)
*   **[TEST-UNIT]:** Unit Test Implementation/Update
*   **[TEST-INT]:** Integration Test Implementation/Update (API, Store-Component, RLS)
*   **[TEST-E2E]:** End-to-End Test (Optional for V1, focus on Manual Testing)
*   **[ANALYTICS]:** Analytics Integration (`@paynless/analytics`)
*   **[REFACTOR]:** Code Refactoring Step
*   **[COMMIT]:** Checkpoint for Git Commit

**Pre-computation / Setup:**

*   [ ] Ensure database migration tooling is set up (e.g., Supabase CLI migrations).
*   [ ] Ensure RLS helper functions (`is_org_member`, `get_user_role`) exist or create placeholders.
*   [ ] Ensure testing frameworks (Vitest, pgTAP/equivalent, potentially Playwright/Cypress later) are configured.
*   [ ] Create a feature branch in Git.

---

## Phase 1: Core Backend & Data Model for Org Context

**Goal:** Establish the database structure and basic backend logic to support organization-scoped chats.

**Step 1.1: Database Schema Changes for Org & System Prompt**

*   [DB] Create migration script:
    *   Add `organization_id UUID NULLABLE REFERENCES organizations(id) ON DELETE SET NULL` to `chats`.
    *   Add index on `chats(organization_id)`.
    *   Add `system_prompt_id UUID NULLABLE REFERENCES system_prompts(id) ON DELETE SET NULL` to `chats`.
    *   Add `allow_member_chat_creation BOOLEAN NOT NULL DEFAULT true` to `organizations`.
*   [ ] Apply migration locally.
*   [COMMIT] "feat(DB): Add organization_id, system_prompt_id to chats; allow_member_chat_creation to orgs"

**Step 1.2: Implement Basic RLS Policies & Tests**

*   [TEST-INT] Write failing RLS tests (using pgTAP or manual SQL queries) for `chats` SELECT:
    *   User CAN select own personal chat (`organization_id` IS NULL).
    *   User CANNOT select other user's personal chat.
    *   User CAN select org chat if active member.
    *   User CANNOT select org chat if not member.
    *   User CANNOT select org chat if inactive member.
*   [BE] Implement/Update RLS policy for `SELECT` on `public.chats` table based on REQ-TECH-2.1. Ensure `is_org_member` helper is used.
*   [TEST-INT] Run RLS tests for SELECT. Refactor policy until tests pass (Green).
*   [REFACTOR] Review RLS policy for clarity and efficiency.
*   [COMMIT] "feat(BE): Implement RLS SELECT policy for chats table w/ tests"
*   Repeat RLS Test/Implement/Refactor cycle for INSERT, DELETE, UPDATE policies on `chats` as defined in REQ-TECH-2.1, including checks for `allow_member_chat_creation` and admin role where applicable. Ensure helper functions are robust.
*   [COMMIT] "feat(BE): Implement RLS INSERT/DELETE/UPDATE policies for chats w/ tests"

**Step 1.3: Update Backend API Endpoints (Read Operations)**

*   [API] Modify relevant `AiApiClient` methods (e.g., `getChats`, `getChatDetails`) to accept optional `organizationId: string | null`.
*   [TEST-UNIT] Write failing unit tests for the updated `AiApiClient` methods, mocking API responses.
*   [API] Implement the changes in `AiApiClient`. Ensure tests pass.
*   [COMMIT] "feat(API): Add optional organizationId param to chat read methods"
*   [TEST-INT] Write failing integration tests for the backend Edge Functions (e.g., GET `/chats`, GET `/chat/[chatId]`) simulating requests with/without `organizationId` and different user contexts.
*   [BE] Modify Edge Functions:
    *   Accept optional `organizationId` query parameter/body field.
    *   Modify Supabase client calls (`select()`) to filter based on `organizationId` (using `.eq()` or `.is()`) AND rely on RLS for permission enforcement.
    *   Handle `null`/absent `organizationId` as request for personal chats (`organization_id IS NULL`).
*   [TEST-INT] Run Edge Function integration tests. Refactor backend logic until tests pass.
*   [REFACTOR] Review Edge Function code for clarity and error handling.
*   [COMMIT] "feat(BE): Update chat read Edge Functions to handle organizationId context"

**Step 1.4: Update Backend API Endpoints (Write Operations - Create/Delete)**

*   [API] Modify relevant `AiApiClient` methods (e.g., `createChat`, `deleteChat`) to accept optional `organizationId`.
*   [TEST-UNIT] Write failing unit tests for these API client methods.
*   [API] Implement changes in `AiApiClient`. Ensure tests pass.
*   [COMMIT] "feat(API): Add optional organizationId param to chat write methods"
*   [TEST-INT] Write failing integration tests for backend Edge Functions (e.g., POST `/chats`, DELETE `/chat/[chatId]`) simulating requests with/without `organizationId` and different user roles.
*   [BE] Modify Edge Functions:
    *   Accept optional `organizationId`.
    *   Pass `organization_id` to Supabase client calls (`insert()`, `delete()`). RLS should handle the core permission logic (including `allow_member_chat_creation` check on insert, admin role check on delete).
    *   Return appropriate success/error responses.
*   [TEST-INT] Run Edge Function integration tests. Refactor until tests pass.
*   [COMMIT] "feat(BE): Update chat write Edge Functions to handle organizationId context"

---

## Phase 2: State Management & Core UI Integration

**Goal:** Connect the frontend state and UI components to the organization context.

**Step 2.1: Refactor State Management (`useAiStore`)**

*   [TEST-UNIT] Review existing `useAiStore` tests. Write *new* failing tests for desired state structure and selector behavior with org context (e.g., `selectChatHistoryList` should return different lists based on `currentOrganizationId`).
*   [STORE] Refactor `useAiStore` state structure (REQ-TECH-4.1). Update actions (`loadChats`, `startNewChat`, etc.) to accept `organizationId` and fetch/update state accordingly. Update selectors to be context-aware.
*   [TEST-UNIT] Run `useAiStore` tests. Refactor store logic until tests pass.
*   [REFACTOR] Ensure state updates are efficient and selectors are memoized where appropriate. Break down large actions/reducers if needed.
*   [COMMIT] "refactor(STORE): Restructure useAiStore for organizational context w/ tests"
*   *(Optional but Recommended)* [STORE] [REFACTOR] If `useOrganizationStore` is overly complex, refactor it now into smaller, more focused stores/slices. Update associated tests.
*   [COMMIT] "refactor(STORE): Refactor useOrganizationStore for clarity (if applicable)"

**Step 2.2: Implement Chat Context Selection UI**

*   [TEST-UNIT] Write failing tests for a new reusable component (`ChatContextSelector`?) that takes org list and current selection, and calls back on change.
*   [UI] Create the `ChatContextSelector` component using `shadcn/ui` (e.g., `Select`). Fetch available organizations (user is member of) from `useOrganizationStore`. Display "Personal" and organization names. Manage selected state.
*   [TEST-UNIT] Ensure component tests pass.
*   [COMMIT] "feat(UI): Create ChatContextSelector component w/ tests"
*   [UI] Integrate `ChatContextSelector` near the "New Chat" initiation point. When a context is selected *before* starting a chat, pass this context (`organizationId` or `null`) to the `startNewChat` action in `useAiStore`.
*   [TEST-INT] Write integration tests (or manual tests) verifying that selecting a context correctly influences the `organization_id` of the newly created chat record in the DB.
*   [COMMIT] "feat(UI): Integrate ChatContextSelector for new chat creation"

**Step 2.3: Implement Segregated Chat History UI**

*   [UI] Modify the `ChatHistory` component:
    *   Fetch `currentOrganizationId` from `useOrganizationStore`.
    *   Call the context-aware `selectChatHistoryList` selector from `useAiStore`, passing the current context.
    *   Implement UI for distinct sections (Personal vs. Org) using Tabs or similar (`REQ-ORG-2.1`).
    *   Add visual indicators (icons/prefixes) to list items (`REQ-ORG-2.3`).
    *   Ensure the list updates when the global `currentOrganizationId` changes.
*   [TEST-UNIT] Update/write unit tests for `ChatHistory` verifying correct rendering based on context and state from mock stores.
*   [UI] Implement loading skeletons (`REQ-UX-2.2`) for the history list.
*   [UI] Implement Error Boundary (`REQ-UX-2.4`) around the history list.
*   [TEST-INT] Manual testing: Verify history list updates correctly when switching orgs, creating new chats in different contexts.
*   [COMMIT] "feat(UI): Implement segregated chat history view with context awareness, loading, and errors"

**Step 2.4: Display Active Chat Context & Handle Navigation**

*   [UI] Modify the main `AiChat` component:
    *   Fetch the details of the currently loaded chat, including its `organization_id` and `system_prompt_id` from `useAiStore`.
    *   Display the chat's context (Personal or Org Name) prominently (`REQ-ORG-1.2`).
    *   Ensure selecting a chat from history correctly loads its state, including messages and context display (`REQ-UX-1.3`).
    *   Pass the correct `system_prompt_id` to relevant child components or API calls (`REQ-UX-1.5`, `REQ-UX-1.6`).
*   [TEST-UNIT] Update/write tests for `AiChat` verifying context display and correct data propagation.
*   [UI] Implement loading skeletons for the message area (`REQ-UX-2.2`).
*   [UI] Implement Error Boundary around the main chat interface (`REQ-UX-2.4`).
*   [TEST-INT] Manual testing: Verify navigation between personal/org chats works, context display is correct, system prompts load correctly.
*   [COMMIT] "feat(UI): Display active chat context, ensure correct state loading on navigation w/ loading & errors"

**Step 2.5: Implement Admin Controls UI**

*   [UI] In `ChatHistory` list items for *organization* chats:
    *   Conditionally render a "Delete" button/menu item *only if* the current user has the 'admin' role for the `currentOrganizationId` (check `useOrganizationStore`).
    *   On click, show a confirmation dialog. On confirm, call `deleteChat` action from `useAiStore`, passing the correct `chatId` and `organizationId`.
*   [TEST-UNIT] Add tests for conditional rendering of the delete button based on mock role.
*   [ANALYTICS] Trigger `chat_deleted` event on successful deletion.
*   [UI] Modify the Organization Settings page:
    *   Add a `Switch` or Checkbox component (using `shadcn/ui`) bound to the `allow_member_chat_creation` setting for the current organization. Fetch the current value.
    *   On change, call a new API endpoint/Edge Function (e.g., PUT `/organization/[orgId]/settings`) to update the `allow_member_chat_creation` column in the `organizations` table. (Requires new API client method, Edge Function, and potentially RLS update allowing admins to modify their org settings).
*   [TEST-UNIT] Add tests for the settings toggle component.
*   [TEST-INT] Write integration tests for the new org settings update endpoint.
*   [ANALYTICS] Trigger `member_chat_creation_toggled` event on successful update.
*   [COMMIT] "feat(UI): Implement admin delete chat UI and member chat creation toggle setting"

---

## Phase 3: Core Chat Experience Enhancements

**Goal:** Implement key UX improvements identified in the requirements.

**Step 3.1: Fix Core Chat Behaviors**

*   [UI] Ensure default provider/prompt loading works (`REQ-UX-1.1`). Add tests if missing.
*   [UI] Implement reliable auto-scrolling to the *top* of new messages (`REQ-UX-1.4`). Test thoroughly with different message heights and speeds. Add tests if feasible.
*   [UI] Ensure chat history list updates dynamically on creation (`REQ-UX-1.2`). Add tests.
*   [COMMIT] "fix(UI): Correct default loading, auto-scroll behavior, and dynamic history updates w/ tests"

**Step 3.2: Implement Markdown Rendering**

*   [UI] Integrate `react-markdown` or similar library into the message display component.
*   [TEST-UNIT] Add tests verifying that message content with various Markdown syntax renders correctly.
*   [UI] Ensure proper sanitization is used to prevent XSS vulnerabilities.
*   [COMMIT] "feat(UI): Implement Markdown rendering for chat messages w/ tests"

**Step 3.3: Implement Token Usage Tracking & Display**

*   [ ] Install `tiktoken` or chosen tokenizer library.
*   [UI] Create a hook or utility (`useTokenEstimator`?) that takes text input and returns an estimated token count using the tokenizer.
*   [TEST-UNIT] Write unit tests for the token estimation logic.
*   [UI] Integrate the estimator with the chat input component, displaying the count (`REQ-UX-4.2`).
*   [BE] Ensure backend Edge Function (`/chat` - message sending) parses `prompt_tokens` and `completion_tokens` from the AI provider response.
*   [DB] Ensure token usage is saved to the `chat_messages` table (e.g., in `metadata` or `token_usage` column) (`REQ-UX-4.4`). Modify migration if needed.
*   [API] [STORE] [UI] Ensure token usage data is passed back to the frontend and stored in `useAiStore`.
*   [UI] Display token count per assistant message (`REQ-UX-4.5`).
*   [UI] Implement cumulative token tracking display for the session (`REQ-UX-4.6`). Create a component for this.
*   [TEST-UNIT] Add tests for the cumulative display component based on mock message data.
*   [ANALYTICS] Add `token_usage_displayed` event trigger.
*   [COMMIT] "feat(UX): Implement token estimation and usage display w/ tests & analytics"

**Step 3.4: Implement Chat Rewind/Reprompt (V1 - Replace)**

*   [DB] If needed, create migration to add `is_active_in_thread` flag to `chat_messages` (`REQ-TECH-1.4`).
*   [UI] Add UI element (e.g., button on user messages) to trigger rewind mode (`REQ-UX-5.1`).
*   [UI] On trigger, populate input with selected message content (`REQ-UX-5.2`). Change submit button text/action to "Resubmit" (`REQ-UX-5.3`).
*   [API] Modify `AiApiClient.sendMessage` to potentially accept a `rewindFromMessageId` parameter or similar indicator.
*   [BE] Modify `/chat` Edge Function:
    *   If handling a rewind request:
        *   Identify the target message.
        *   Mark all subsequent messages in the chat thread as inactive (e.g., set `is_active_in_thread = false`). This requires careful DB update logic.
        *   Construct the prompt history *only up to the edited message*.
        *   Call the AI provider.
        *   Save the new assistant response(s) as active messages.
*   [TEST-INT] Write integration tests for the rewind backend logic, verifying correct message inactivation and history reconstruction.
*   [STORE] Update `useAiStore` state and actions to handle the message updates/replacements correctly when a rewind occurs. Ensure selectors return only active messages.
*   [UI] Add visual indicator for rewind point if desired (`REQ-UX-5.5`).
*   [ANALYTICS] Add `chat_rewind_used` event trigger.
*   [TEST-INT] Perform thorough manual testing of the rewind flow, including edge cases.
*   [COMMIT] "feat(FEATURE): Implement chat rewind/reprompt (replace history) w/ tests & analytics"

---

## Phase 4: Standardization, Cleanup & Testing

**Goal:** Ensure code quality, consistency, and finalize testing.

**Step 4.1: UI Standardization (`shadcn/ui`)**

*   [UI] [REFACTOR] Review all components modified or created during this project. Ensure consistent use of `shadcn/ui` components, spacing, and theming (`REQ-UX-2.1`).
*   [COMMIT] "style(UI): Ensure consistent shadcn/ui usage across chat features"

**Step 4.2: Final Code Review & Refactor**

*   [REFACTOR] Review all new/modified code (BE, API, STORE, UI) for clarity, efficiency, adherence to standards, and proper TypeScript usage. Address any TODOs or temporary workarounds.
*   [TEST-UNIT] [TEST-INT] Ensure test coverage is adequate for critical paths. Improve tests where needed.
*   [COMMIT] "refactor: Final code cleanup and improvements for chat enhancements"

**Step 4.3: Final Manual Testing**

*   [TEST-E2E] Perform comprehensive manual testing of all features end-to-end:
    *   Creating personal chats.
    *   Creating org chats (as admin, as member if allowed/disallowed).
    *   Switching org context and viewing correct history.
    *   Admin deleting org chats.
    *   Admin toggling member creation permission.
    *   Core behaviors (scrolling, prompt loading).
    *   Markdown rendering.
    *   Token display (estimation, actual, cumulative).
    *   Rewind/Reprompt functionality.
    *   Error handling (Error Boundaries, network errors).
    *   Loading states.
*   [ ] Fix any bugs discovered during testing.
*   [COMMIT] "fix: Address bugs found during final manual testing"

---

## Phase 5: Stretch Goals (Optional - If Time Permits)

**Goal:** Implement `.md` file handling if core scope is complete and stable.

**Step 5.1: .md Chat Export**

*   [UI] Add an "Export as MD" button to the chat interface.
*   [UI] Implement client-side logic to format the current (active) chat messages into a Markdown string.
*   [UI] Trigger file download of the generated Markdown content.
*   [TEST-UNIT] Add tests for the Markdown generation utility.
*   [COMMIT] "feat(STRETCH): Implement chat export to Markdown file"

**Step 5.2: .md File Upload**

*   *(Requires significant backend setup for storage)*
*   [BE] Set up Supabase Storage bucket for chat uploads with appropriate security rules (users can upload to a specific path, read own files).
*   [UI] Add a file input button (restricted to `.md`) to the chat input area.
*   [UI] On file selection, upload the file securely to Supabase Storage using the client library.
*   [API] [BE] Modify `sendMessage` endpoint/logic to potentially accept a `fileUrl` or `fileMetadata` parameter.
*   [UI] Display an indicator that a file is attached to the prompt.
*   *(Consideration: How is the file content used? Passed to AI? Just stored? V1 scope likely just storage)*
*   [COMMIT] "feat(STRETCH): Implement basic .md file upload associated with chat messages (requires storage setup)"

---

## Post-Implementation

*   [ ] Merge feature branch into the main development branch.
*   [ ] Deploy changes to staging/production environments.
*   [ ] Monitor analytics and error tracking dashboards.
*   [ ] Create backlog items for deferred features ("Out of Scope" section).
*   [ ] Announce changes to users/beta testers. 
**END SYNTHESIS #2**

**BEGIN SYNTHESIS #3**
# Product Requirements Document

## 1. Executive Summary
This project transforms the existing individual-centric AI Chat into a robust, organization-aware collaboration tool. We will introduce organization-scoped chats with a two-role access model (admin/member), improve core UX behaviors (navigation, scrolling, prompt persistence), add Markdown support, track token usage, and integrate analytics. Advanced real-time collaboration, file attachments, export features, performance monitoring, and privacy policies are explicitly deferred to future phases.

## 2. Problem Statement
Our current AI Chat only supports personal conversations, lacks team collaboration features, and suffers from UX issues such as inconsistent navigation, improper scrolling, and loss of system prompt context. This hampers productivity and prevents wider adoption in multi-user environments.

## 3. User Personas
- **Organization Administrator**  
  Manages organization settings and chat access controls.  
- **Organization Member**  
  Participates in organization-scoped chats based on role permissions.  
- **Individual User**  
  Uses AI Chat for personal tasks outside any organization context.

## 4. Goals
1. Enable creation and use of AI chats scoped to an organization or kept personal.  
2. Provide clear, persistent UI context selection (Personal vs. Organization).  
3. Implement a simple RBAC model with `admin` and `member` roles.  
4. Fix core UX issues: reliable navigation, auto-scroll to top of new messages, and prompt persistence.  
5. Support Markdown input and rendering in messages.  
6. Track and display token usage per message and session.  
7. Emit analytics events for key interactions via `packages/analytics`.  
8. Defer advanced real-time collaboration, file handling/export, performance metrics, and privacy/data-retention policies.

## 5. Detailed Requirements

### 5.1 Organization Integration
5.1.1 **Context Selection**  
- On chat creation, users choose “Personal” or a specific Organization.  
- The chat header displays a persistent toggle showing the active context.

5.1.2 **Chat History Segmentation**  
- Chat History UI separates Personal chats and Org chats into labeled sections.  
- When switching organizations, only that org’s chats appear in the Org section.

5.1.3 **Default Behavior**  
- Default context is Personal unless the user explicitly selects an Organization.

### 5.2 Access Control
5.2.1 **Roles**  
- Two roles in `organization_members`: `admin` and `member`.

5.2.2 **Permissions**  
- **Admin**: Create org chats, delete any org chat, enable/disable member chat creation.  
- **Member**: View all org chats, create new org chats if allowed, delete/edit own messages.

5.2.3 **Database-Level Enforcement (RLS)**  
- Chats with `organization_id = NULL` are personal and accessible only to their owner.  
- Org-scoped chats are accessible to users with an active membership in that organization.

### 5.3 Chat Experience Improvements
5.3.1 **Navigation & Replay**  
- Selecting a past chat reliably navigates to the chat view and restores its system prompt and message state.

5.3.2 **Auto-Scroll**  
- Upon receiving a new message, scroll so the **top** of that new message is visible from its beginning.

5.3.3 **System Prompt Persistence**  
- Each chat record persists its `system_prompt_id`. Loading or replay restores the prompt automatically.

### 5.4 Technical Requirements
5.4.1 **Database**  
- Add `organization_id UUID NULLABLE` to `public.chats` with an index on `(organization_id, updated_at)`.

5.4.2 **API Client (`@paynless/api`)**  
- Extend `ChatApiClient` methods (`fetchChats`, `sendMessage`, etc.) to accept an optional `organizationId` (default `null`).

5.4.3 **State Management (`@paynless/store`)**  
- Refactor `useOrganizationStore` to expose `currentOrganizationId`.  
- Refactor `useAiStore` to partition chats and messages by `organizationId` and update selectors/actions accordingly.

5.4.4 **Frontend (`apps/web`)**  
- Implement the context toggle UI in `ChatInterface`.  
- Update `ChatList`, `ChatHistory`, and message components to respect `currentOrganizationId`.  
- Use `shadcn/ui` components, loading skeletons, and React error boundaries.

### 5.5 Markdown Support
- The chat input area must accept Markdown syntax.  
- Render user and assistant messages with basic Markdown (bold, italics, lists, code blocks).

### 5.6 Token Usage Tracking
- Integrate a client-side tokenizer (e.g., `tiktoken`) to estimate prompt tokens before sending.  
- Persist `prompt_tokens` and `completion_tokens` from AI responses in `chat_messages`.  
- Display per-message token counts and cumulative session totals (user, assistant, total).

### 5.7 Analytics Integration
- Emit analytics events (`chat.create`, `message.send`, `chat.load`, `context.switch`, `token.estimate`) using `packages/analytics`.

### 5.8 .md File Handling (Stretch Goal)
- Document as a future stretch goal:  
  - Attach `.md` files to chats.  
  - Export chat history as `.md`.

### 5.9 Testing Requirements
- Follow a strict TDD approach: write unit tests before each feature.  
- **Unit Tests**: API client methods, store actions, selectors.  
- **Integration Tests**: RLS policies, Edge Function endpoints, store↔API interactions.  
- Defer performance, end-to-end, cross-browser, and UAT tests to later phases.

---

# Implementation Plan

## Overview
We will apply a **RED → GREEN → REFACTOR** workflow. Each feature or fix comprises:
1. **Stop & Write Failing Test** (unit or integration).  
2. **Implement Code** to make tests pass.  
3. **Refactor** for clarity, reusability, and adherence to standards.  
4. **Commit** with a descriptive message.  
5. **Run** `npm test`, `npm run build`, and restart the dev server.  

Checkpoints are documented at each sub-step. We use feature branches (`feature/org-chat-enhancements`) and enforce code review.

---

## Phase 1: Setup & Architecture

1. [ ] Create branch `feature/org-chat-enhancements`.  
2. [ ] Add dependencies:  
   - `packages/analytics` (if not already present).  
   - Tokenizer library (e.g., `tiktoken`).  
3. [ ] Define test templates:  
   - Jest setup for unit tests in `@paynless/api` and `@paynless/store`.  
   - Integration test harness for Supabase Edge Functions.  
4. [ ] Validate CI pipeline runs new tests and builds without errors.

---

## Phase 2: Data Model & Migrations

1. [ ] **Stop:** Write a unit test verifying the presence of `organization_id` migration file and its down-script.  
2. [ ] Create Supabase migration to add `organization_id UUID NULLABLE` to `public.chats` with index.  
3. [ ] **Stop:** Run integration tests against a staging DB to confirm the new column & index exist.  
4. [ ] Implement or update the helper SQL function `is_org_member(org_id, user_id, status)`.  
5. [ ] **Stop:** Write integration tests that assert RLS policies on `chats` for both `admin` and `member` roles.

---

## Phase 3: API Client Updates

1. [ ] **Stop:** Write unit tests in `@paynless/api` for `ChatApiClient` methods confirming they accept and forward `organizationId`.  
2. [ ] Update method signatures (`fetchChats`, `createChat`, `sendMessage`, etc.) to include optional `organizationId`.  
3. [ ] **Stop:** Ensure unit tests pass and confirm request payloads contain `organizationId`.  
4. [ ] Modify Supabase Edge Functions to read and enforce `organizationId` via RLS.  
5. [ ] **Stop:** Write integration tests calling local Edge Functions for personal vs. org-scoped requests.

---

## Phase 4: State Management Refactor

1. [ ] **Stop:** Write unit tests for `useOrganizationStore` to verify setting and retrieving `currentOrganizationId`.  
2. [ ] Refactor `useOrganizationStore` to expose `currentOrganizationId` and `setCurrentOrganization` actions.  
3. [ ] **Stop:** Write unit tests for updated `useAiStore` selectors that filter by `currentOrganizationId`.  
4. [ ] Refactor `useAiStore` state to partition `chatsByOrgId` and `messagesByOrgId`.  
5. [ ] [ ] Add unit tests for new store actions (`loadChats`, `sendMessage`) ensuring they include `organizationId`.

---

## Phase 5: Frontend Component Implementation

1. [ ] **Stop:** Write an integration test (React Testing Library) asserting `ChatInterface` renders a context toggle.  
2. [ ] Implement context toggle UI using `shadcn/ui` Select or Toggle.  
3. [ ] **Stop:** Test that toggling context updates `useOrganizationStore`.  
4. [ ] Update `ChatList` & `ChatHistory`:  
   - Filter items by `currentOrganizationId`.  
   - Display clear labels/icons for context.  
5. [ ] **Stop:** Unit test `ChatList` with mixed personal/org data sets.  
6. [ ] Implement auto-scroll behavior to show the top of each new message.  
7. [ ] **Stop:** Integration tests simulating new messages and verifying scroll position.  
8. [ ] Wrap chat modules in `ErrorBoundary` components.  
9. [ ] Add `Skeleton` components for chat list and message area loading states.  
10. [ ] **Stop:** Snapshot tests for loading and error states.

---

## Phase 6: System Prompt Persistence

1. [ ] **Stop:** Write unit test ensuring `system_prompt_id` is stored when creating a chat.  
2. [ ] Update DB schema/handler to include `system_prompt_id` on chat creation.  
3. [ ] Refactor `ChatInterface` to retrieve and display the saved prompt on load/replay.  
4. [ ] **Stop:** Integration test simulating chat load and verifying correct prompt restoration.

---

## Phase 7: Markdown Support

1. [ ] **Stop:** Write unit tests for a Markdown rendering component (e.g., Remark).  
2. [ ] Enable Markdown syntax in the chat input area.  
3. [ ] Implement Markdown rendering in message bubbles.  
4. [ ] **Stop:** Integration tests verifying rendered HTML for sample Markdown inputs.

---

## Phase 8: Token Usage Tracking

1. [ ] **Stop:** Write unit test for client-side tokenizer estimating prompt tokens.  
2. [ ] Integrate the tokenizer library and display the estimate near the input.  
3. [ ] Persist `prompt_tokens` & `completion_tokens` from AI responses to `chat_messages`.  
4. [ ] **Stop:** Integration tests confirming token counts appear correctly in UI and data store.  
5. [ ] Add UI component in chat footer displaying cumulative session token usage.

---

## Phase 9: Analytics Instrumentation

1. [ ] **Stop:** Write unit tests mocking `packages/analytics` to assert events:  
   - `chat.create`, `message.send`, `chat.load`, `context.switch`, `token.estimate`.  
2. [ ] Instrument analytics calls in both API client and frontend actions.  
3. [ ] **Stop:** Run unit tests confirming correct event payloads for each user interaction.

---

## Phase 10: Stretch Goals (Backlogged)

- Real-time multi-user collaboration  
- Privacy & data-retention policies  
- Performance monitoring & SLAs  
- Mobile-optimized UI  
- File attachment & `.md` export  
- E2E, cross-browser, and UAT testing  

Add these to the backlog with clear acceptance criteria for future phases.

---

**Checkpoints & Commit Guidelines**  
- After each “Stop” step, run `npm test`, `npm run build`, and restart the dev server.  
- Commit passing changes with clear messages, e.g., `feat(chat): add organization_id to chats`.  
- Update code coverage reports and ensure no regressions.  
- Upon completing core phases (1–9), open a PR for code review.  
- Merge only when all tests pass and peer review is complete.  

---

**Reminder:** After merging, remind the team to pull the latest migrations, restart the development server, and verify end-to-end chat workflows manually.
**END SYNTHESIS #3**
**END SYNTHESIS SECTION**

**BEGIN PARENTHESIS SEED**
The SYNTHESIS phase is concluded. DO NOT generate a new SYNTHESIS. 

We are beginning the PARENTHESIS (implementation plan) phase. You will produce a PARENTHESIS (implementation plan) response according to the SYNTHESIS materials and instructions that follow. 

# User Opinion Statement
All three SYNTHESES provided are very strong and the user was pleased with them. 

The user provided the following specific responses to elements in the SYNTHESES. 

# USER RESPONSE TO SYNTHESIS #1
- Synthesis #1 is very good and thorough. It is well structured and describes the expected outcome well. 
- Synthesis #1 has a very well developed Implementation Plan that includes many of the general steps required to complete the project. 
- The Implementation Plan could provide a good basis for a PARENTHESIS implementation plan, but would require significantly more detail added to each step, and the incorporation of sub-steps to ensure it exhaustively describes the implementation to the development team. 

# USER RESPONSE TO SYNTHESIS #2
- Synthesis #2 has a very good PRD. Its unique naming convention should be used in the PARENTHESIS. 
- Synthesis #2 has a very good explanation of Detailed Requirements.These details should be included where appropriate in the PARENTHESIS implementation plan. 
- Synthesis #2 has a very useful restatement of out-of-scope items that should be preserved for future implementation. 
- Synthesis #2 has a very good legend. This should be used in the PARENTHESIS. 
- Synthesis #2 has a very good implementation plan. 

# USER RESPONSE TO SYNTHESIS #3
- The way that SYNTHESIS #3 explicitly identifies "Stop", "Test", "Build", "Commit" after each major implementation step is very helpful. These guideposts are useful for the development team to remind them when to take specific actions during development. 

**EXISTING APPLICATION STRUCTURE** 
# The following section represents the structure of the current application as it is implemented. 
- Use this structure to understand every folder, file, page, component, card, hook, function, store, type, API, table, trigger, and other application components that currently exists in the project. 
- Use this structure to describe and explain every new folder, file, page, component, card, hook, function, store, type, API, table, trigger, and other application component that must be implemented to complete the project. 
- Detail the updates to the structure that will be required by your implementation plan so that the development team can see exactly where all new code will be located and how it will work with existing code. 

# Project Structure & Architecture

## Architecture Overview

The architecture follows these principles:
- Clear separation between frontend (React) and backend (Supabase Edge Functions)
- RESTful API endpoints (Edge Functions) serve business logic
- Frontend consumes the API via a layered structure (UI -> Service -> API Client)
- Stateless authentication using JWT tokens managed via Supabase Auth
- Consistent error handling and response formatting via `apiClient`
- State management primarily using Zustand stores

### Core Pattern: API Client Singleton

**Decision (April 2025):** To ensure consistency and simplify integration across multiple frontend platforms (web, mobile) and shared packages (like Zustand stores), the `@paynless/api` package follows a **Singleton pattern**.

*   **Initialization:** The client is configured and initialized *once* per application lifecycle using `initializeApiClient(config)`. Each platform provides the necessary configuration.
*   **Access:** All parts of the application (stores, UI components, platform-specific code) access the single, pre-configured client instance by importing the exported `api` object: `import { api } from '@paynless/api';`.
*   **No DI for Stores:** Shared stores (Zustand) should *not* use dependency injection (e.g., an `init` method) to receive the API client. They should import and use the `api` singleton directly.
*   **Testing:** Unit testing components or stores that use the `api` singleton requires mocking the module import using the test framework's capabilities (e.g., `vi.mock('@paynless/api', ...)`).
*   **Consistency Note:** Older stores (`authStore`, `subscriptionStore`) may still use an outdated DI pattern and require refactoring to align with this singleton approach.


## API Endpoints (Supabase Edge Functions)

The application exposes the following primary API endpoints through Supabase Edge Functions:

### Authentication & Core User
- `/login`: Handles user sign-in via email/password.
- `/register`: Handles user registration via email/password.
- `/logout`: Handles user logout.
- `/session`: Fetches current session information. *(Needs verification if still used)*
- `/refresh`: Refreshes the authentication token.
- `/reset-password`: Handles the password reset flow.
- `/me`: Fetches the profile for the currently authenticated user.
- `/profile`: Updates the profile for the currently authenticated user.
- `/ping`: Simple health check endpoint.

### Subscriptions & Billing
- `/api-subscriptions`: Main router for subscription actions.
  - `GET /current`: Fetches the current user's subscription status.
  - `GET /plans`: Fetches available Stripe subscription plans.
  - `POST /checkout`: Creates a Stripe Checkout session.
  - `POST /billing-portal`: Creates a Stripe Customer Portal session.
  - `POST /:subscriptionId/cancel`: Cancels a specific subscription.
  - `POST /:subscriptionId/resume`: Resumes a specific subscription.
  - `GET /usage/:metric`: Fetches usage metrics for a specific metric.
- `/stripe-webhook`: Handles incoming webhook events from Stripe (e.g., checkout completed, subscription updates).
- `/sync-stripe-plans`: (Admin/Internal) Function to synchronize Stripe Products/Prices with the `subscription_plans` table.

### AI Chat
- `/ai-providers`: Fetches the list of available/active AI providers.
- `/system-prompts`: Fetches the list of available/active system prompts for AI chat.
- `/chat`: Handles sending a user message to an AI provider, managing context, and saving the conversation.
- `/chat-history`: Fetches the list of chat conversations for the authenticated user.
- `/chat-details/:chatId`: Fetches all messages for a specific chat conversation.
- `/sync-ai-models`: (Admin/Internal) Placeholder function intended to synchronize AI models from providers with the `ai_providers` table.

### Internal / Triggers
- `/on-user-created`: Function triggered by Supabase Auth on new user creation (handles profile creation and **optional email marketing sync**).

### Notifications
- `GET /notifications`: Fetches notifications for the current user.
- `PUT /notifications/:notificationId`: Marks a specific notification as read.
- `POST /notifications/mark-all-read`: Marks all user's notifications as read.

### Multi-Tenancy (Organizations)
- `POST /organizations`: Creates a new organization.
- `GET /organizations`: Lists organizations the current user is a member of (supports pagination).
- `GET /organizations/:orgId`: Fetches details for a specific organization.
- `PUT /organizations/:orgId`: Updates organization details (name, visibility) (Admin only).
- `DELETE /organizations/:orgId`: Soft-deletes an organization (Admin only).
- `GET /organizations/:orgId/members`: Lists members of a specific organization (supports pagination).
- `PUT /organizations/:orgId/members/:membershipId/role`: Updates a member's role (Admin only).
- `DELETE /organizations/:orgId/members/:memberId`: Removes a member from an organization (Admin or self).
- `POST /organizations/:orgId/invites`: Invites a user (by email or user_id) to an organization (Admin only).
- `GET /organizations/:orgId/pending`: Lists pending invites and join requests for an organization (Admin only).
- `DELETE /organizations/:orgId/invites/:inviteId`: Cancels a pending invite (Admin only).
- `POST /organizations/:orgId/requests`: Creates a request to join a public organization.
- `PUT /organizations/members/:membershipId/status`: Approves or denies a pending join request (Admin only).
- `GET /organizations/invites/:token/details`: Fetches details for a specific invite token (Invited user only).
- `POST /organizations/invites/:token/accept`: Accepts an organization invitation (Invited user only).
- `POST /organizations/invites/:token/decline`: Declines an organization invitation (Invited user only).

*(Note: This list is based on the `supabase/functions/` directory structure and verified function handlers. Specific request/response details require inspecting function code or the `api` package.)*

## Database Schema (Simplified)

The core database tables defined in `supabase/migrations/` include:

*(Note: This schema description is based on previous documentation and may require verification against the actual migration files (`supabase/migrations/`) for complete accuracy, especially regarding constraints, defaults, and RLS policies.)*

- **`public.user_profiles`** (Stores public profile information for users)
  - `id` (uuid, PK, references `auth.users(id) ON DELETE CASCADE`)
  - `first_name` (text, nullable)
  - `last_name` (text, nullable)
  - `role` (public.user_role enum [`'user'`, `'admin'`], NOT NULL, default `'user'`)
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.subscription_plans`** (Stores available subscription plans, mirrors Stripe Products/Prices)
  - `id` (uuid, PK, default `uuid_generate_v4()`)
  - `stripe_price_id` (text, UNIQUE, NOT NULL) - *Corresponds to Stripe Price ID (e.g., `price_...`)*
  - `stripe_product_id` (text, nullable) - *Corresponds to Stripe Product ID (e.g., `prod_...`)*
  - `name` (text, NOT NULL)
  - `description` (jsonb, nullable) - *Structured as `{ "subtitle": "...", "features": ["...", "..."] }`*
  - `amount` (integer, NOT NULL) - *Amount in smallest currency unit (e.g., cents)*
  - `currency` (text, NOT NULL) - *3-letter ISO code (e.g., `'usd'`)*
  - `interval` (text, NOT NULL) - *One of `'day'`, `'week'`, `'month'`, `'year'`*
  - `interval_count` (integer, NOT NULL, default `1`)
  - `active` (boolean, NOT NULL, default `true`) - *Whether the plan is offered*
  - `metadata` (jsonb, nullable) - *For additional plan details*
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.user_subscriptions`** (Stores user subscription information linked to Stripe)
  - `id` (uuid, PK, default `uuid_generate_v4()`)
  - `user_id` (uuid, UNIQUE, NOT NULL, references `public.user_profiles(id) ON DELETE CASCADE`) - *Made UNIQUE*
  - `stripe_customer_id` (text, UNIQUE, nullable)
  - `stripe_subscription_id` (text, UNIQUE, nullable)
  - `status` (text, NOT NULL) - *e.g., `'active'`, `'canceled'`, `'trialing'`, `'past_due'`, `'free'`*
  - `plan_id` (uuid, nullable, references `public.subscription_plans(id)`)
  - `current_period_start` (timestamp with time zone, nullable)
  - `current_period_end` (timestamp with time zone, nullable)
  - `cancel_at_period_end` (boolean, nullable, default `false`)
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.subscription_transactions`** (Logs Stripe webhook events for processing and auditing)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, NOT NULL, references `auth.users(id) ON DELETE CASCADE`)
  - `stripe_event_id` (text, UNIQUE, NOT NULL) - *Idempotency key*
  - `event_type` (text, NOT NULL) - *e.g., `'checkout.session.completed'`*
  - `status` (text, NOT NULL, default `'processing'`) - *Processing status*
  - `stripe_checkout_session_id` (text, nullable)
  - `stripe_subscription_id` (text, nullable)
  - `stripe_customer_id` (text, nullable)
  - `stripe_invoice_id` (text, nullable)
  - `stripe_payment_intent_id` (text, nullable)
  - `amount` (integer, nullable) - *Smallest currency unit*
  - `currency` (text, nullable)
  - `user_subscription_id` (uuid, nullable, references `public.user_subscriptions(id) ON DELETE SET NULL`)
  - `created_at` (timestamp with time zone, NOT NULL, default `now()`)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`)

- **`public.ai_providers`** (Stores information about supported AI models/providers)
  - `id` (uuid, PK)
  - `name` (text, NOT NULL, e.g., "OpenAI GPT-4o")
  - `api_identifier` (text, NOT NULL, UNIQUE, e.g., "openai-gpt-4o") - *Internal identifier*
  - `description` (text, nullable)
  - `is_active` (boolean, NOT NULL, default `true`)
  - `config` (jsonb, nullable) - *Non-sensitive config, excludes API keys*
  - `created_at`, `updated_at` (timestamptz)

- **`public.system_prompts`** (Stores reusable system prompts for AI chat)
  - `id` (uuid, PK)
  - `name` (text, NOT NULL, e.g., "Helpful Assistant")
  - `prompt_text` (text, NOT NULL)
  - `is_active` (boolean, NOT NULL, default `true`)
  - `created_at`, `updated_at` (timestamptz)

- **`public.chats`** (Represents a single AI chat conversation thread)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, nullable, FK references `auth.users(id) ON DELETE SET NULL`) - *Nullable for potential anonymous chats*
  - `title` (text, nullable) - *e.g., Auto-generated from first message*
  - `created_at`, `updated_at` (timestamptz)

- **`public.chat_messages`** (Stores individual messages within a chat)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `chat_id` (uuid, NOT NULL, FK references `chats(id) ON DELETE CASCADE`)
  - `user_id` (uuid, nullable, FK references `auth.users(id) ON DELETE SET NULL`) - *Tracks sender if needed*
  - `role` (text, NOT NULL) - *e.g., 'user', 'assistant', 'system'*
  - `content` (text, NOT NULL) - *The message text*
  - `ai_provider_id` (uuid, nullable, FK references `ai_providers(id)`) - *Logs which provider generated the response*
  - `system_prompt_id` (uuid, nullable, FK references `system_prompts(id)`) - *Logs which system prompt was used*
  - `token_usage` (jsonb, nullable) - *Stores request/response tokens from AI API*
  - `created_at` (timestamptz)

### [NEW] Notifications & Multi-Tenancy Schema

- **`public.notifications`** (Stores in-app notifications for users)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, NOT NULL, FK references `auth.users(id) ON DELETE CASCADE`)
  - `type` (text, NOT NULL) - *e.g., 'organization_invite', 'org_join_request', 'org_role_changed'*
  - `data` (jsonb, nullable) - *Stores context like `subject`, `message`, `target_path`, `org_id`, `inviter_name` etc.*
  - `read` (boolean, NOT NULL, default `false`)
  - `created_at` (timestamptz, NOT NULL, default `now()`)
  - *Indexes:* (`user_id`, `created_at` DESC), (`user_id`, `read`)

- **`public.organizations`** (Represents a team, workspace, or organization)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `name` (text, NOT NULL)
  - `visibility` (text, NOT NULL, CHECK (`visibility` IN ('private', 'public')), default `'private'`)
  - `deleted_at` (timestamp with time zone, default `NULL`) - *For soft deletion*
  - `created_at` (timestamp with time zone, default `now()` NOT NULL)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`) - *Added*

- **`public.organization_members`** (Junction table linking users to organizations)
  - `id` (uuid, PK, default `gen_random_uuid()`)
  - `user_id` (uuid, NOT NULL, FK references `auth.users(id) ON DELETE CASCADE`)
  - `organization_id` (uuid, NOT NULL, FK references `organizations(id) ON DELETE CASCADE`)
  - `role` (text, NOT NULL, CHECK (`role` IN ('admin', 'member')))
  - `status` (text, NOT NULL, CHECK (`status` IN ('pending', 'active', 'removed')))
  - `created_at` (timestamp with time zone, default `now()` NOT NULL)
  - `updated_at` (timestamp with time zone, NOT NULL, default `now()`) - *Added*
  - *Indexes:* (`user_id`), (`organization_id`), (`user_id`, `organization_id`) UNIQUE

- **`public.invites`** (Stores invitations for users to join organizations)
  - `id` (uuid PK DEFAULT `gen_random_uuid()`)
  - `invite_token` (TEXT UNIQUE NOT NULL DEFAULT `extensions.uuid_generate_v4()`)
  - `organization_id` (UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE)
  - `invited_email` (TEXT NOT NULL)
  - `invited_user_id` (UUID NULLABLE REFERENCES auth.users(id) ON DELETE SET NULL)
  - `role_to_assign` (TEXT NOT NULL CHECK (`role_to_assign` IN ('admin', 'member')))
  - `invited_by_user_id` (UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL)
  - `status` (TEXT NOT NULL CHECK (`status` IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT `'pending'`)
  - `created_at` (TIMESTAMPTZ DEFAULT `now()` NOT NULL)
  - `expires_at` (TIMESTAMPTZ NULL)
  - *Indexes:* (`invite_token`), (`organization_id`), (`invited_email`), (`invited_user_id`), (`status`), (`organization_id`, `invited_email` where `status`='pending'), (`organization_id`, `invited_user_id` where `status`='pending')

### [NEW] Backend Logic (Notifications & Tenancy)

- **Row-Level Security (RLS):**
  - `notifications`: Users can only access their own notifications.
  - `organizations`: Users can only SELECT/UPDATE/DELETE non-deleted orgs they are active members of (role-based permissions for UPDATE/DELETE). Authenticated users can INSERT.
  - `organization_members`: Users can SELECT memberships for orgs they are members of. Admins can manage memberships within their org (INSERT/UPDATE/DELETE, respecting last admin check). Users can DELETE their own membership (leave).
  - `invites`: Admins can manage invites (SELECT/INSERT/UPDATE/DELETE) for their org. Invited users (matched by ID or email) can SELECT/UPDATE (status only) their own pending invites.
  - *Existing Tables*: RLS on tables like `chats`, `chat_messages`, etc., **needs review** to ensure they correctly scope data based on the user's `currentOrganizationId` or active organization memberships, possibly via helper functions or policy adjustments.
- **Triggers/Functions:**
  - **Notification Triggers:** Database triggers (`handle_new_invite_notification`, `handle_new_join_request`, `handle_member_role_change`, `handle_member_removed`) create entries in `notifications` upon specific events in `invites` or `organization_members`.
  - **Invite Management Triggers:**
    - `restrict_invite_update_fields`: Prevents non-admins from changing fields other than `status` on invites.
    - `link_pending_invites_on_signup`: Updates `invites.invited_user_id` when a user signs up with a matching email.
  - **Membership Management:**
    - **Last Admin Check:** A trigger prevents the last active admin of a non-deleted organization from being removed or demoted.
  - **Helper Functions:**
    - `is_org_member(org_id, user_id, status, role)`: Checks membership status/role in an org (used by RLS).
    - `is_org_admin(org_id)`: Checks if current user is admin of org (used by RLS).
    - `check_existing_member_by_email(org_id, email)`: Checks if email belongs to existing member/pending request (used by backend).

## Project Structure (Monorepo)

The project is organized as a monorepo using pnpm workspaces:

```
/
├── apps/                   # Individual applications / Frontends
│   ├── web/                # React Web Application (Vite + React Router)
│   │   └── src/
│   │       ├── assets/         # Static assets (images, fonts, etc.)
│   │       ├── components/     # UI Components specific to web app
│   │       │   ├── ai/
│   │       │   ├── auth/
│   │       │   ├── billing/
│   │       │   ├── common/
│   │       │   ├── core/
│   │       │   ├── integrations/
│   │       │   ├── layout/       # Includes header, sidebar
│   │       │   ├── marketing/
│   │       │   ├── profile/
│   │       │   ├── routes/
│   │       │   ├── subscription/
│   │       │   ├── organizations/ # << NEW
│   │       │   │   ├── AdminBadge.tsx
│   │       │   │   ├── CreateOrganizationForm.tsx
│   │       │   │   ├── CreateOrganizationModal.tsx
│   │       │   │   ├── DeleteOrganizationDialog.tsx
│   │       │   │   ├── InviteMemberCard.tsx
│   │       │   │   ├── MemberListCard.tsx
│   │       │   │   ├── OrganizationDetailsCard.tsx
│   │       │   │   ├── OrganizationListCard.tsx
│   │       │   │   ├── OrganizationSettingsCard.tsx
│   │       │   │   ├── OrganizationSwitcher.tsx
│   │       │   │   └── PendingActionsCard.tsx
│   │       │   ├── ui/           # Re-exported shadcn/ui components
│   │       │   └── Notifications.tsx # << CORRECTED: Top-level component for notifications
│   │       │   └── NotificationCard.tsx # << NEW: Component for individual notification display
│   │       ├── config/         # App-specific config (e.g., routes)
│   │       ├── context/        # React context providers
│   │       ├── hooks/          # Custom React hooks
│   │       ├── lib/            # Utility functions (e.g., cn)
│   │       ├── pages/          # Page components (routed via React Router)
│   │       │   ├── AcceptInvitePage.tsx
│   │       │   ├── AiChat.tsx
│   │       │   ├── Dashboard.tsx
│   │       │   ├── Home.tsx
│   │       │   ├── Login.tsx
│   │       │   ├── Notifications.tsx
│   │       │   ├── OrganizationFocusedViewPage.tsx
│   │       │   ├── OrganizationHubPage.tsx
│   │       │   ├── Profile.tsx
│   │       │   ├── Register.tsx
│   │       │   ├── Subscription.tsx
│   │       │   └── SubscriptionSuccess.tsx
│   │       ├── routes/         # Route definitions and protected routes
│   │       ├── tests/          # Web App Tests (Vitest)
│   │       │   ├── unit/         # Unit tests (*.unit.test.tsx)
│   │       │   ├── integration/  # Integration tests (*.integration.test.tsx)
│   │       │   ├── e2e/          # End-to-end tests (Placeholder)
│   │       │   ├── utils/        # Shared test utilities (render, etc.)
│   │       │   ├── mocks/        # Shared mocks (MSW handlers, components, stores)
│   │       │   └── setup.ts      # Vitest global setup (MSW server start, etc.)
│   │       ├── App.tsx         # Root application component
│   │       ├── index.css       # Global styles
│   │       └── main.tsx        # Application entry point (renders App)
│   ├── ios/                # iOS Application (Placeholder) //do not remove
│   ├── android/            # Android Application (Placeholder) //do not remove
│   ├── desktop/            # Desktop Application (Tauri/Rust)
│   ├── linux/              # Desktop Application (Placeholder) //do not remove
│   └── macos/              # Desktop Application (Placeholder) //do not remove
│
├── packages/               # Shared libraries/packages
│   ├── api/         # Frontend API client logic (Singleton)
│   │   └── src/
│   │       ├── apiClient.ts      # Base API client (fetch wrapper, singleton)
│   │       ├── stripe.api.ts     # Stripe/Subscription specific client methods
│   │       ├── ai.api.ts         # AI Chat specific client methods
│   │       ├── notifications.api.ts # << NEW - Notification fetching/updates/realtime
│   │       └── organizations.api.ts # << NEW - Organization & Member management methods
│   ├── analytics/   # Frontend analytics client logic (PostHog, Null adapter)
│   │   └── src/
│   │       ├── index.ts          # Main service export & factory
│   │       ├── nullAdapter.ts    # No-op analytics implementation
│   │       └── posthogAdapter.ts # PostHog implementation
│   ├── store/              # Zustand global state stores
│   │   └── src/
│   │       ├── authStore.ts        # Auth state & actions
│   │       ├── subscriptionStore.ts # Subscription state & actions
│   │       └── aiStore.ts          # AI Chat state & actions
│   │       ├── notificationStore.ts # << NEW - In-app notification state & actions
│   │       └── organizationStore.ts # << NEW - Organization/Multi-tenancy state & actions
│   ├── types/              # Shared TypeScript types and interfaces
│   │   └── src/
│   │       ├── api.types.ts
│   │       ├── auth.types.ts
│   │       ├── subscription.types.ts
│   │       ├── ai.types.ts
│   │       ├── analytics.types.ts
│   │       ├── platform.types.ts
│   │       ├── email.types.ts    # [NEW] Email marketing types
│   │       ├── theme.types.ts
│   │       ├── route.types.ts
│   │       ├── vite-env.d.ts
│   │       └── index.ts            # Main export for types
│   ├── platform/ # Service for abstracting platform-specific APIs (FS, etc.)
│   │   └── src/
│   │       ├── index.ts          # Main service export & detection
│   │       ├── webPlatformCapabilities.ts # Web provider (stub)
│   │       └── tauriPlatformCapabilities.ts # Tauri provider (stub)
│   └── utils/              # Shared utility functions
│       └── src/
│           └── logger.ts         # Logging utility (singleton)
│
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Backend API)
│   │   ├── _shared/          # Shared Deno utilities for functions
│   │   │   ├── auth.ts           # Auth helpers
│   │   │   ├── cors-headers.ts   # CORS header generation
│   │   │   ├── email_service/    # [NEW] Email marketing service
│   │   │   │   ├── factory.ts      # [NEW] Selects email service implementation
│   │   │   │   ├── kit_service.ts  # [NEW] Kit implementation (planned)
│   │   │   │   └── no_op_service.ts # [NEW] No-op implementation (planned)
│   │   │   ├── responses.ts      # Standardized response helpers
│   │   │   └── stripe-client.ts  # Stripe client initialization
│   │   ├── node_modules/     # Function dependencies (managed by Deno/npm)
│   │   ├── api-subscriptions/ # Subscription management endpoints
│   │   ├── ai-providers/     # Fetch AI providers
│   │   ├── chat/             # Handle AI chat message exchange
│   │   ├── chat-details/     # Fetch messages for a specific chat
│   │   ├── chat-history/     # Fetch user's chat list
│   │   ├── login/
│   │   ├── logout/
│   │   ├── me/               # User profile fetch
│   │   ├── on-user-created/  # Auth Hook: Triggered after user signs up
│   │   ├── ping/             # Health check
│   │   ├── profile/          # User profile update
│   │   ├── refresh/
│   │   ├── register/
│   │   ├── reset-password/
│   │   ├── session/
│   │   ├── stripe-webhook/   # Stripe event handler
│   │   ├── sync-ai-models/   # Sync AI models to DB (Placeholder)
│   │   ├── sync-stripe-plans/ # Sync Stripe plans to DB
│   │   ├── system-prompts/   # Fetch system prompts
│   │   ├── notifications/    # << NEW - Notification backend logic
│   │   ├── organizations/    # << NEW - Organization backend logic
│   │   ├── tools/            # Internal tooling scripts (e.g., env sync)
│   │   ├── deno.jsonc
│   │   ├── deno.lock
│   │   ├── README.md         # Functions-specific README
│   │   └── types_db.ts       # Generated DB types
│   └── migrations/         # Database migration files (YYYYMMDDHHMMSS_*.sql)
│
├── .env                    # Local environment variables (Supabase/Stripe/Kit keys, etc. - UNTRACKED)
├── .env.example            # Example environment variables
├── netlify.toml            # Netlify deployment configuration
├── package.json            # Root package file (pnpm workspaces config)
├── pnpm-lock.yaml          # pnpm lock file
├── pnpm-workspace.yaml     # pnpm workspace definition
├── tsconfig.base.json      # Base TypeScript configuration for the monorepo
├── tsconfig.json           # Root tsconfig (references base)
└── README.md               # Project root README (often minimal, points here)
```

## Edge Functions (`supabase/functions/`)

```
supabase/functions/
│
├── _shared/             # Shared Deno utilities
│   ├── auth.ts
│   ├── cors-headers.ts
│   ├── email_service/   # [NEW] Email marketing service
│   │   ├── factory.ts
│   │   ├── kit_service.ts
│   │   └── no_op_service.ts
│   ├── responses.ts
│   └── stripe-client.ts
│
├── api-subscriptions/   # Handles subscription actions (checkout, portal, plans, current, cancel, resume, usage)
├── ai-providers/        # Fetches active AI providers
├── chat/                # Handles AI chat message exchange, context management, history saving
├── chat-details/        # Fetches messages for a specific chat ID
├── chat-history/        # Fetches the list of chats for the authenticated user
├── login/               # Handles user login
├── logout/              # Handles user logout
├── me/                  # Handles fetching the current user's profile
├── on-user-created/     # Auth Hook: Triggered after user signs up (e.g., create profile, **email sync**)
├── ping/                # Simple health check endpoint
├── profile/             # Handles updating the current user's profile
├── refresh/             # Handles session token refresh
├── register/            # Handles user registration
├── reset-password/      # Handles password reset flow
├── session/             # Handles session validation/information (needs verification)
├── stripe-webhook/      # Handles incoming Stripe events
├── sync-ai-models/      # [Admin/Internal] Syncs AI models from providers to DB (Placeholder/Inactive?)
├── sync-stripe-plans/   # [Admin/Internal] Syncs Stripe plans to DB
└── system-prompts/      # Fetches active system prompts
```

## Core Packages & Exports (For AI Assistants)

This section details the key exports from the shared packages to help AI tools understand the available functionality. *(Note: Details require inspecting package source code)*

### 1. `packages/api` (API Interaction)

Manages all frontend interactions with the backend Supabase Edge Functions. It follows a **Singleton pattern**.

- **`initializeApiClient(config: ApiInitializerConfig): void`**: Initializes the singleton instance. Must be called once at application startup.
  - `config: { supabaseUrl: string; supabaseAnonKey: string; }`
- **`api` object (Singleton Accessor)**: Provides methods for making API requests. Import and use this object directly: `import { api } from '@paynless/api';`
  - **`api.get<ResponseType>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a GET request.
  - **`api.post<ResponseType, RequestBodyType>(endpoint: string, body: RequestBodyType, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a POST request.
  - **`api.put<ResponseType, RequestBodyType>(endpoint: string, body: RequestBodyType, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a PUT request.
  - **`api.delete<ResponseType>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<ResponseType>>`**: Performs a DELETE request.
  - **`api.billing()`**: Accessor for the `StripeApiClient` instance.
  - **`api.ai()`**: Accessor for the `AiApiClient` instance.

- **`FetchOptions` type** (defined in `@paynless/types`): Extends standard `RequestInit`.
  - `{ isPublic?: boolean; token?: string; }` (Plus standard `RequestInit` properties like `headers`, `method`, `body`)
    - `isPublic: boolean` (Optional): If true, the request is made without an Authorization header (defaults to false). The API client *always* includes the `apikey` header.
    - `token: string` (Optional): Explicitly provide an auth token to use, otherwise the client attempts to get it from the `authStore` if `isPublic` is false.

- **`ApiResponse<T>` type** (defined in `@paynless/types`): Standard response wrapper.
  - `{ status: number; data?: T; error?: ApiErrorType; }`

- **`ApiError` class** (defined in `@paynless/api`): Custom error class used internally by the client.
- **`AuthRequiredError` class** (defined in `@paynless/types`): Specific error for auth failures detected by the client.

#### `StripeApiClient` (Accessed via `api.billing()`)
Methods for interacting with Stripe/Subscription related Edge Functions.

- `createCheckoutSession(priceId: string, isTestMode: boolean, successUrl: string, cancelUrl: string, options?: FetchOptions): Promise<ApiResponse<CheckoutSessionResponse>>`
  - Creates a Stripe Checkout session.
  - Requires `successUrl` and `cancelUrl` for redirection.
  - Returns the session URL (in `data.sessionUrl`) or error.
- `createPortalSession(isTestMode: boolean, returnUrl: string, options?: FetchOptions): Promise<ApiResponse<PortalSessionResponse>>`
  - Creates a Stripe Customer Portal session.
  - Requires `returnUrl` for redirection after portal usage.
  - Returns the portal URL (in `data.url`) or error.
- `getSubscriptionPlans(options?: FetchOptions): Promise<ApiResponse<SubscriptionPlan[]>>`
  - Fetches available subscription plans (e.g., from `subscription_plans` table).
  - Returns `{ plans: SubscriptionPlan[] }` in the `data` field (Note: API returns array directly, type adjusted for clarity).
- `getUserSubscription(options?: FetchOptions): Promise<ApiResponse<UserSubscription>>`
  - Fetches the current user's subscription details.
- `cancelSubscription(subscriptionId: string, options?: FetchOptions): Promise<ApiResponse<void>>`
  - Cancels an active subscription via the backend.
- `resumeSubscription(subscriptionId: string, options?: FetchOptions): Promise<ApiResponse<void>>`
  - Resumes a canceled subscription via the backend.
- `getUsageMetrics(metric: string, options?: FetchOptions): Promise<ApiResponse<SubscriptionUsageMetrics>>`
  - Fetches usage metrics for a specific subscription metric.

#### `AiApiClient` (Accessed via `api.ai()`)
Methods for interacting with AI Chat related Edge Functions.

- `getAiProviders(token?: string): Promise<ApiResponse<AiProvider[]>>`
  - Fetches the list of active AI providers.
  - `token` (Optional): Uses token if provided, otherwise assumes public access (`isPublic: true` in options).
- `getSystemPrompts(token?: string): Promise<ApiResponse<SystemPrompt[]>>`
  - Fetches the list of active system prompts.
  - `token` (Optional): Uses token if provided, otherwise assumes public access (`isPublic: true` in options).
- `sendChatMessage(data: ChatApiRequest, options: FetchOptions): Promise<ApiResponse<ChatMessage>>`
  - Sends a chat message to the backend `/chat` function.
  - `data: ChatApiRequest ({ message: string, providerId: string, promptId: string, chatId?: string })`
  - `options: FetchOptions` (Must include `token` for authenticated user).
- `getChatHistory(token: string): Promise<ApiResponse<Chat[]>>`
  - Fetches the list of chat conversations for the authenticated user.
  - `token` (Required): User's auth token.
- `getChatMessages(chatId: string, token: string): Promise<ApiResponse<ChatMessage[]>>`
  - Fetches all messages for a specific chat.
  - `chatId` (Required): ID of the chat.
  - `token` (Required): User's auth token.

### 2. `packages/store` (Global State Management)

Uses Zustand for state management with persistence for session data.

#### `useAuthStore` (Hook)
Manages user authentication, session, and profile state.

- **State Properties** (Access via `useAuthStore(state => state.propertyName)`):
  - `user: User | null`
  - `session: Session | null`
  - `profile: UserProfile | null`
  - `isLoading: boolean`
  - `error: Error | null`
  - `navigate: NavigateFunction | null` (Internal function for routing, set via `setNavigate`)
- **Actions** (Access via `useAuthStore.getState().actionName` or destructure `const { actionName } = useAuthStore();`):
  - `setNavigate(navigateFn: NavigateFunction): void`
    - Injects the navigation function from the UI framework (e.g., React Router).
  - `setUser(user: User | null): void`
  - `setSession(session: Session | null): void`
  - `setProfile(profile: UserProfile | null): void`
  - `setIsLoading(isLoading: boolean): void`
  - `setError(error: Error | null): void`
  - `login(email: string, password: string): Promise<User | null>`
    - Calls `/login` endpoint, updates state, handles internal navigation on success (including potential action replay).
    - Returns user object on success, null on failure.
  - `register(email: string, password: string): Promise<User | null>`
    - Calls `/register` endpoint, updates state, handles internal navigation on success (including potential action replay).
    - Returns user object on success, null on failure.
  - `logout(): Promise<void>`
    - Calls `/logout` endpoint, clears local state.
  - `initialize(): Promise<void>`
    - Checks persisted session, calls `/me` endpoint to verify token and fetch user/profile.
  - `refreshSession(): Promise<void>`
    - Calls `/refresh` endpoint using the refresh token, updates state.
  - `updateProfile(profileData: UserProfileUpdate): Promise<boolean>`
    - Calls `/profile` endpoint (PUT), updates local profile state on success.
    - Returns true on success, false on failure.

#### `useSubscriptionStore` (Hook)
Manages subscription plans and the user's current subscription status.

- **State Properties**:
  - `userSubscription: UserSubscription | null`
  - `availablePlans: SubscriptionPlan[]`
  - `isSubscriptionLoading: boolean`
  - `hasActiveSubscription: boolean` (Derived from `userSubscription.status`)
  - `isTestMode: boolean` (Set via `setTestMode` action, typically from env var)
  - `error: Error | null`
- **Actions**:
  - `setUserSubscription(subscription: UserSubscription | null): void`
  - `setAvailablePlans(plans: SubscriptionPlan[]): void`
  - `setIsLoading(isLoading: boolean): void`
  - `setTestMode(isTestMode: boolean): void`
  - `setError(error: Error | null): void`
  - `loadSubscriptionData(): Promise<void>`
    - Fetches available plans (`/api-subscriptions/plans`) and current user subscription (`/api-subscriptions/current`).
    - Requires authenticated user (uses token from `authStore`).
  - `refreshSubscription(): Promise<boolean>`
    - Calls `loadSubscriptionData` again. Returns true on success, false on failure.
  - `createCheckoutSession(priceId: string): Promise<string | null>`
    - Calls `api.billing().createCheckoutSession`. Requires success/cancel URLs derived from `window.location`.
    - Returns the Stripe Checkout session URL on success, null on failure.
    - Requires authenticated user.
  - `createBillingPortalSession(): Promise<string | null>`
    - Calls `api.billing().createPortalSession`. Requires return URL derived from `window.location`.
    - Returns the Stripe Customer Portal URL on success, null on failure.
    - Requires authenticated user.
  - `cancelSubscription(subscriptionId: string): Promise<boolean>`
    - Calls `api.billing().cancelSubscription`, then `refreshSubscription`. Returns true on success, false on failure.
    - Requires authenticated user.
  - `resumeSubscription(subscriptionId: string): Promise<boolean>`
    - Calls `api.billing().resumeSubscription`, then `refreshSubscription`. Returns true on success, false on failure.
    - Requires authenticated user.
  - `getUsageMetrics(metric: string): Promise<SubscriptionUsageMetrics | null>`
    - Calls `api.billing().getUsageMetrics`. Returns usage metrics object on success, null on failure.
    - Requires authenticated user.

#### `useAiStore` (Hook)
Manages AI chat state, including providers, prompts, messages, and history.

- **State Properties**:
  - `availableProviders: AiProvider[]`
  - `availablePrompts: SystemPrompt[]`
  - `currentChatMessages: ChatMessage[]`
  - `currentChatId: string | null`
  - `chatHistoryList: Chat[]`
  - `isLoadingAiResponse: boolean` (True while waiting for AI message response)
  - `isConfigLoading: boolean` (True while loading providers/prompts)
  - `isHistoryLoading: boolean` (True while loading chat history list)
  - `isDetailsLoading: boolean` (True while loading messages for a specific chat)
  - `aiError: string | null` (Stores error messages related to AI operations)
- **Actions**:
  - `loadAiConfig(): Promise<void>`
    - Fetches AI providers (`/ai-providers`) and system prompts (`/system-prompts`).
  - `sendMessage(data: ChatApiRequest): Promise<ChatMessage | null>`
    - Handles sending a message via `api.ai().sendChatMessage`. Requires `token` in `FetchOptions` provided to API client.
    - Manages optimistic UI updates for user message.
    - Updates `currentChatMessages` and `currentChatId`.
    - If `AuthRequiredError` is caught, attempts to store pending action and navigate to `/login`.
    - Returns the received `ChatMessage` on success, null on API error or if auth redirect occurs.
  - `loadChatHistory(): Promise<void>`
    - Fetches the user's chat list via `api.ai().getChatHistory`.
    - Updates `chatHistoryList`.
    - Requires authenticated user (token obtained from `authStore`).
  - `loadChatDetails(chatId: string): Promise<void>`
    - Fetches messages for a specific chat via `api.ai().getChatMessages`.
    - Updates `currentChatId` and `currentChatMessages`.
    - Requires authenticated user (token obtained from `authStore`).
  - `startNewChat(): void`
    - Resets `currentChatId` and `currentChatMessages`.
  - `clearAiError(): void`
    - Sets `aiError` state to null.

### 3. `packages/utils` (Shared Utilities)

#### `logger.ts` (Logging Utility)
Provides a singleton logger instance (`logger`) for consistent application logging.

- **`logger` instance** (Singleton, import `logger` from `@paynless/utils`):
  - `logger.debug(message: string, metadata?: LogMetadata): void`
  - `logger.info(message: string, metadata?: LogMetadata): void`
  - `logger.warn(message: string, metadata?: LogMetadata): void`
  - `logger.error(message: string, metadata?: LogMetadata): void`
- **Configuration**:
  - `logger.configure(config: Partial<LoggerConfig>): void`
    - `config: { minLevel?: LogLevel; enableConsole?: boolean; captureErrors?: boolean; }`
- **`LogLevel` enum**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **`LogMetadata` interface**: `{ [key: string]: unknown; }` (For structured logging data)

### 4. `packages/types` (Shared TypeScript Types)

Contains centralized type definitions used across the monorepo. Exports all types via `index.ts`.

- **`api.types.ts`**: `ApiResponse`, `ApiErrorType`, `FetchOptions`, `AuthRequiredError`, etc.
- **`auth.types.ts`**: `User`, `Session`, `UserProfile`, `UserProfileUpdate`, `AuthStore`, `AuthResponse`, etc.
- **`subscription.types.ts`**: `SubscriptionPlan`, `UserSubscription`, `SubscriptionStore`, `SubscriptionUsageMetrics`, `CheckoutSessionResponse`, `PortalSessionResponse`, `SubscriptionPlansResponse`, etc.
- **`ai.types.ts`**: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, `ChatApiRequest`, `AiState`, `AiStore`, etc.
- **`analytics.types.ts`**: `AnalyticsClient`, `AnalyticsEvent`, `AnalyticsUserTraits`.
- **`platform.types.ts`**: `PlatformCapabilities`, `FileSystemCapabilities`.
- **`email.types.ts`**: `SubscriberInfo`, `EmailMarketingService`. **[NEW]**
- **`theme.types.ts`**: Types related to theming.
- **`route.types.ts`**: Types related to application routing.
- **`vite-env.d.ts`**: Vite environment types.

### 5. `packages/platform` (Platform Abstraction)

Provides a service to abstract platform-specific functionalities (like filesystem access) for use in shared UI code.

- **`getPlatformCapabilities(): PlatformCapabilities`**: Detects the current platform (web, tauri, etc.) and returns an object describing available capabilities. Result is memoized.
  - Consumers check `capabilities.fileSystem.isAvailable` before attempting to use filesystem methods.
- **Providers (Internal):**
  - `webPlatformCapabilities.ts`: Implements capabilities available in a standard web browser (currently FS is `isAvailable: false`).
  - `tauriPlatformCapabilities.ts`: Implements capabilities available in the Tauri desktop environment (currently FS is `isAvailable: false`, planned to call Rust backend).
- **`resetMemoizedCapabilities(): void`**: Clears the cached capabilities result (useful for testing).

### 6. `supabase/functions/_shared/` (Backend Shared Utilities)

Contains shared Deno code used by multiple Edge Functions (CORS handling, Supabase client creation, auth helpers, Stripe client initialization, **email marketing service**). Refer to the files within this directory for specific utilities.

## Core Packages Breakdown

### `@paynless/api`
- **Purpose:** Provides typed methods for interacting with the backend Supabase Edge Functions. Implemented as a **Singleton** initialized once per app.
- **Key Classes/Methods:**
  - `ApiClient`: Base class handling fetch, auth headers, error handling, response parsing.
  - `StripeApiClient`: Methods like `getCurrentSubscription`, `createCheckoutSession`, `createBillingPortalSession`, `getPlans`.
  - `AiApiClient`: Methods like `sendMessage`, `getChatHistory`, `getChatDetails`, `getAiProviders`, `getSystemPrompts`.
  - `NotificationApiClient`: Methods like `fetchNotifications`, `markNotificationRead`, `markAllNotificationsAsRead`, `subscribeToNotifications`, `unsubscribeFromNotifications`.
  - `OrganizationApiClient`: Methods like `createOrganization`, `updateOrganization`, `listUserOrganizations`, `getOrganizationDetails`, `getOrganizationMembers`, `inviteUserByEmail`, `acceptOrganizationInvite`, `declineOrganizationInvite`, `requestToJoinOrganization`, `approveJoinRequest`, `updateMemberRole`, `removeMember`, `leaveOrganization`, `deleteOrganization`, `cancelInvite`, `denyJoinRequest`, `getPendingOrgActions`, `getInviteDetails`.

### `@paynless/store`
- **Purpose:** Manages global application state using Zustand.
- **Key Stores:**
  - `useAuthStore`: Handles user authentication state, profile data, login/register/logout actions, profile updates.
  - `useSubscriptionStore`: Manages subscription status, available plans, and actions like initiating checkout or portal sessions.
  - `useAiStore`: Manages AI chat state including providers, prompts, conversation history, current messages, and sending messages.
  - `useNotificationStore`: Manages in-app notifications, unread count, fetching/marking read, and handling realtime updates via Supabase channels.
  - `useOrganizationStore`: Manages multi-tenancy state including user's organizations list, current organization context (ID, details, members, pending actions), pagination, invite details, and actions for all organization/member/invite/request operations. Also manages related UI state (modals).

### `@paynless/types`
- **Purpose:** Centralizes TypeScript type definitions (interfaces, types) used across the monorepo.
  - **`api.types.ts`**: `ApiResponse`, `ApiErrorType`, `FetchOptions`, `AuthRequiredError`, etc.
  - **`auth.types.ts`**: `User`, `Session`, `UserProfile`, `UserProfileUpdate`, `AuthStore`, `AuthResponse`, etc.
  - **`subscription.types.ts`**: `SubscriptionPlan`, `UserSubscription`, `SubscriptionStore`, `SubscriptionUsageMetrics`, `CheckoutSessionResponse`, `PortalSessionResponse`, `SubscriptionPlansResponse`, etc.
  - **`ai.types.ts`**: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, `ChatApiRequest`, `AiState`, `AiStore`, etc.
  - **`analytics.types.ts`**: `AnalyticsClient`, `AnalyticsEvent`, `AnalyticsUserTraits`.
  - **`platform.types.ts`**: `PlatformCapabilities`, `FileSystemCapabilities`.
  - **`email.types.ts`**: `SubscriberInfo`, `EmailMarketingService`. **[NEW]**
  - **`theme.types.ts`**: Types related to theming.
  - **`route.types.ts`**: Types related to application routing.
  - **`vite-env.d.ts`**: Vite environment types.

### 5. `packages/platform` (Platform Abstraction)

Provides a service to abstract platform-specific functionalities (like filesystem access) for use in shared UI code.

- **`getPlatformCapabilities(): PlatformCapabilities`**: Detects the current platform (web, tauri, etc.) and returns an object describing available capabilities. Result is memoized.
  - Consumers check `capabilities.fileSystem.isAvailable` before attempting to use filesystem methods.
- **Providers (Internal):**
  - `webPlatformCapabilities.ts`: Implements capabilities available in a standard web browser (currently FS is `isAvailable: false`).
  - `tauriPlatformCapabilities.ts`: Implements capabilities available in the Tauri desktop environment (currently FS is `isAvailable: false`, planned to call Rust backend).
- **`resetMemoizedCapabilities(): void`**: Clears the cached capabilities result (useful for testing).

### 6. `supabase/functions/_shared/` (Backend Shared Utilities)

Contains shared Deno code used by multiple Edge Functions (CORS handling, Supabase client creation, auth helpers, Stripe client initialization, **email marketing service**). Refer to the files within this directory for specific utilities. 

**COMMENTS AND INSTRUCTIONS FROM THE USER**
# We are now prepared to generate a PARENTHESIS (working plan).
The PARENTHESIS does not include a restatement of the Product Requirements Documents. 

The PARENTHESIS is a detailed, thorough, comprehensive, verbose translation of the SYNTHESIS products into a an implementation plan that will be followed by the development team. 

The PARENTHESIS must be sequentially ordered, following the implementation dependencies of the project, so that each work step enables the next work step to occur. 

Be as verbose as required to comprehensively detail a professional, ordered, logical, robust, reliable, and effective implementation plan, in the form of a checklist, that will guide the development team through the entire implementation process from start to finish. 

For an implementation plan, it is not possible to be too detailed, too fine-grained, or too specific. Do not leave anything to assumption or implication. Be explicit so that the implementation team knows exactly what to do at every step. 

- SYNTHESIS #1 has a very good level of step detail in its Implementation Plan. 
- SYNTHESIS #2 has a very good legend, structure, and verbosity in its Implementation Plan.
- The PARENTHESIS should attempt to include a step-level detail that meets or exceeds that in SYNTHESIS #1, with a legend, structure, and verbosity that meets or exceeds that in SYNTHESIS #2. 

## For every step you detail, stop and ask, 
- "Are there unstated sub-steps or dependencies that must be completed in a specific order"? 
- "Are we respecting the existing architecture?" 
- "Are we building this as reusable functions, components, and modules?" 
- "Is there anything a user might expect to have access to in this feature that we have not yet described a full, tested implementation of?" 
- "Will the implementation team be able to fully implement this step by itself or will they need to generate sub-steps to complete the implementation?" 
- "What files will be impacted by this step?" 
- "What tests will need to be written or updated for this step?" 

## For every test, stop and ask,
- "Have we considered every case that we will likely encounter?" 
- "Are there any code paths we can anticipate that we need to build a test for?" 
- "Does this test account for all of the functionality, interactions, and capabilities that the PRD states or implies?"

## For every function, stop and ask, 
- "Are there any other elements of the function signature, args, or returns that are required?" 
- "Is there an existing function that we already have implemented that should be used here?" 
- "Have we typed this fully for dependency inversion, and placed the interfaces and types into the types folder structure?" 
- "Is this function maximally abstracted and reusable?" 

## For every feature, stop and ask,
- "What are all the user interactions that this feature details?" 
- "Have we anticipated all the backend, api, store, and frontend elements that are required to fully implement this feature and its complete functionality?" 
- "Is this feature maximally abstracted and reusable?" 
- "Is there anything a user might expect to have access to in this feature that we have not yet described a full, tested implementation of?" 

# Errors and Omissions
- The user noticed a few misunderstandings in the prior SYNTHESIS documents.
-- The API referred to in SYNTHESIS #1 as "ChatApiClient" is "ai.api". 
-- The analytics system is implemented using an abstraction layer. 
-- The currently-implemented analytics system that consumes the abstraction layer is Posthog. 

# Structuring the implementation plan
*   [ ] Each work step will be uniquely named for easy reference. 
    *   [ ] Worksteps will be nested as shown.
        *   [ ] Nesting can be as deep as logically required. 
*   [ ] This represents a work step that has not been reached. 
*   [✅] This represents a completed step or nested set.
*   [🚧] This represents an incomplete or partially completed step or nested set.
*   [⏸️] This represents a paused step where a discovery has been made that requires backtracking. 
*   [❓] This represents an uncertainty that must be resolved before continuing. 
*   [🚫] This represents a blocked, halted, stopped step or nested set that has some unresolved problem or prior dependency to resolve before continuing.

# Note on testing
- The implementation team does not use a local development database.
- The implementation team deploys functions, migrations, and triggers directly into the live database and backend. 
- The implementation team does not have a test suite for database tables or RLS policies. 
- The implementation team does have a test suite for edge functions. 

# Guidance and Additional Requirements
- All implementation steps for producing all new functions and features must respect backend <-> API <-> Frontend and API <-> Store architecture. 
- All new components required for this project must have their implementation plan developed so that the finished component is a module that is generic and reusable 
- All implementation plan phases and steps must be test-driven with tests written before implementing source code using a typical RED-GREEN-REFACTOR TDD methodology. 
- All plan phases and steps must have clear checkpoints to stop, analyze, build tests, develop feature or function, rerun tests, improve test coverage, refactor components, improve tests, and commit
- All plans must clearly indicate when a new unit test is required
- All plans must clearly indicate when a new integration test is required 
- All implementation work must track what files have changed as work proceeds, indicating what unit and integration tests require updating 
- All implementation plan work must indicate when to stop and update new or existing unit and integration tests. 
- All user interactions must implement existing user analytics package (packages/analytics)

**You will now output your PARENTHESIS (implementation plan) response as an .md file.** 