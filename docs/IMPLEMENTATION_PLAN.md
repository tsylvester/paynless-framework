**Complete Features** //Or complete "for now"

*   [✅] AI Chat on homepage doesn't work **Now pushes through login flow**
*   [✅] AI Chat signup/login flow
*   [✅] Mixpanel or Posthog integration
*   [✅] Change email from within app
*   [✅] Fix chat history box so it fills correctly  
*   [✅] Integrate the session replay logic that broke authStore, but fix it so it's compatible with the working method 
*   [✅] Fix dark mode for last card on homepage **It actually works, it's just way blue-er than anything else.**
*   [✅] Constrain AI Chatbox and Chat History to viewport size 
*   [✅] Fix chat so it scrolls with user **I //think// this works now, needs better testing**
*   [✅] Revert changes in authStore for initialize and updateProfile to working version in commit 58d6e17a
*   [✅] Cancel Subscription doesn't work, API error
*   [✅] Header scroll with user
*   [🚧] AI model sync automation
    *   [✅] Unit Test Google provider sync logic (`supabase/functions/sync-ai-models/google_sync.test.ts`)
    *   [✅] Unit Test Anthropic provider sync logic (`supabase/functions/sync-ai-models/anthropic_sync.test.ts`)
    *   [✅] Unit Test OpenAI provider sync logic (`supabase/functions/sync-ai-models/openai_sync.test.ts`)
    *   [✅] Unit Test main sync router (`supabase/functions/sync-ai-models/index.test.ts`)
    *   [✅] Manual invocation works
    *   [ ] Implement & Test Cron Job trigger
*   [✅] Figure out how to parse chat responses better, they get messy if the assistant uses markdown 
*   [✅] Consolidate authStore with Zustand, remove the direct localSession interactions.
*   [✅] Fix super long login delay on chat flow 
*   [X] Fix the UI tests 

**Incomplete Features** // Or In Progress
*   [ ] **Implement `PublicRoute` Component:**
    *   [ ] Create `PublicRoute.tsx` in `src/components/auth`.
    *   [ ] Implement logic to redirect authenticated users away from public-only pages (e.g., to `/dashboard`).
    *   [ ] Apply `<PublicRoute>` wrapper to `login`, `register`, `
*   [🚧] Notification System (Phase 1 - see `docs/implementations/20250422_Notifications_and_Tenants.md`)
*   [🚧] Multi-Tenancy Support (Organizations/Teams) (Phase 2 - see `docs/implementations/20250422_Notifications_and_Tenants.md`)
*   [ ] Manage Billing sends user to portal but doesn't return user after action.
    *   **Status:** Verified the `return_url` (`<app-origin>/subscription`) is correctly passed to Stripe via the `createBillingPortalSession` backend handler. Stripe logs confirm it receives the correct `return_url`. The general "Return to..." link in the portal works.
    *   **Issue:** Users are not automatically redirected back to the `return_url` after completing specific actions like cancelling a subscription or updating payment methods; they remain on the Stripe portal page.
    *   **Investigation:**
        *   This seems related to Stripe's portal configuration or the need for more specific API parameters, not the basic `return_url` itself.
        *   Stripe documentation mentions using `flow_data[after_completion][redirect][return_url]` within the `billingPortal.sessions.create` call to configure automatic redirects after specific flows (e.g., `payment_method_update`, `subscription_cancel`).
        *   However, configuring this requires knowing the `flow_data.type` upfront, which is difficult for a generic "Manage Billing" button.
    *   **Next Steps:**
        *   **Required:** Investigate Stripe Customer Portal settings in the dashboard for options to enable automatic redirects after specific actions (like cancellation or payment method update). This is the preferred solution if available.
        *   **If Dashboard Settings Insufficient:** Research further into using the `flow_data` parameter, potentially requiring changes to how the portal session is initiated or handling multiple flow types.
    *   https://docs.stripe.com/api/customer_portal/sessions/create

*   [🚧] Test project on Bolt & Lovable 
    *   [ ] Bolt & Lovable don't support pnpm monorepos well atm 
*   [ ] Change password from within app
*   [✅] shadcn implemented
    *   [ ] Convert all pages / components to shadcn
    *   [ ] Loading skeletons for all components 
*   [ ] Run SEO scan & security scan https://owasp.org/www-project-top-ten/
*   [🚧] User email automation - abstract for generic but specific implementation with Kit 
    *   [ ] Everything works EXCEPT the email_sync_trigger for on_user_created, the current form breaks registration
*   [ ] Connect frontend analytics events (PostHog) to email marketing service (Kit) for behavioral triggers (IFTTT)
*   [ ] Groups & organizations - how does Supabase currently support this? // Now being implemented
*   [ ] Notifications - system wide and user specific // Now being implemented
*   [ ] Add dark mode logo 
*   [ ] User avatars and banners 
*   [ ] Fix the types sync script
*   [ ] DRY const _addOptimisticUserMessage in aiStore.ts
*   [ ] Sanitize packages/types, _shared/types.ts, and db_types.ts

**Notification Improvements**
*   [ ] User Notification Preferences (In-app/Email channels, Opt-outs)
*   [ ] Email Notifications (Beyond Invites)
*   [ ] Automatic Notification Cleanup/Archiving
*   [ ] Notification Grouping (Complex for actionable items)
*   [ ] Delete notifications

**Organization Improvements**
*   [ ] Granular Member Roles (Beyond Admin/Member)
*   [ ] Sub-Teams within Organizations
*   [ ] Public Organization Discovery & Search
*   [ ] Domain-Based Joining for Organizations
*   [ ] Enhanced Org Privacy/Visibility Settings
*   [ ] Invite Token Expiration/Management
*   [ ] Organization-Level Billing
*   [ ] Resource Quotas/Limits per Organization
*   [ ] Dedicated Audit Log for Organization Events
*   [ ] Specific Org-Focused User Onboarding Flows
*   [ ] Advanced Org Deletion Data Handling (Archiving, etc.)
*   [ ] Add comma parsing for multiple invites
*   [ ] Fix dropdown in Members card Actions field
*   [ ] Change Orgs page to flex-grid with multiple card sizes, 1y, 2y, 3y, 1x, 2x, 3x 
*   [ ] Components choose card size dynamically based on content.

**UI/UX Refinement**
*   [ ] Add search component
*   [ ] Add filter component 

**Email Improvements**
*   [ ] Fix Kit signup so register button calls Kit sign up
*   [ ] Add password reset via email
*   [ ] Add magic link sign in via email 
*   [ ] Add email for notifications
*   [ ] Add email for org invites for invitees
*   [ ] Add email for org reqs & changes for admins 

**Refactor Org Store**
*   [ ] **Refactor `OrganizationStore` into Slices**
    *   [ ] orgStore.ts combined interface, initial state, and core
    *   [ ] orgStore.list.ts fetching and managing `userOrganizations`
    *   [ ] orgStore.current.ts manages `currentOrganizationId`, `currentOrganizationDetails`, and `currentOrganizationMembers` and related fetches/updates
    *   [ ] orgStore.invite.ts handles invite-specific actions like `acceptInvite`, `declineInvite`, `fetchInviteDetails`.
    *   [ ] orgStore.request.ts handles `requestJoin`, `approveRequest`, `denyRequest`.
    *   [ ] orgStore.ui.ts manages UI-related state, starting with the `isCreateModalOpen` state and its actions (`openCreateModal`, `closeCreateModal`), and adding `isDeleteDialogOpen`, `openDeleteDialog`, `closeDeleteDialog`.