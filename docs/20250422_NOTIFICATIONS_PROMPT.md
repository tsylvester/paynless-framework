# Notification Feature - Resume Context (2025-04-23 End of Session)

This file summarizes the state of the notification system implementation to provide context for resuming work.

## Current Status in Plan

We are currently paused midway through **Phase 1.6 Integration** of the `docs/implementations/20250422_Notifications_and_Tenants.md` plan.

*   **Phase 1.1 - 1.4 (DB Schema, Backend Logic, API Client, State Management):** Marked as complete.
*   **Phase 1.5 (Frontend Component Tests & Implementation):** Marked as complete.
*   **Phase 1.5b (Backend Fix - GET Endpoint):** Added and marked as complete. This involved:
    *   Creating the `/notifications` GET endpoint.
    *   Refactoring it for Dependency Injection (DI).
    *   Writing and passing tests using `_shared/test-utils.ts`.
*   **Phase 1.6 (Integration):**
    *   `<Notifications />` component added to `Header.tsx`.
    *   Manual testing is **blocked** due to outstanding frontend issues.
*   **Phase 1.7 (Checkpoint):** Not started.

## Key Files Worked On

*   `docs/implementations/20250422_Notifications_and_Tenants.md` (Planning)
*   `apps/web/src/components/Notifications.tsx` (Frontend Component Implementation & Debugging)
*   `apps/web/src/components/layout/Header.tsx` (Component Integration)
*   `supabase/functions/notifications/index.ts` (Backend GET Endpoint - Created & Refactored for DI)
*   `supabase/functions/notifications/index.test.ts` (Backend GET Endpoint Tests - Created & Debugged)
*   `supabase/functions/notifications-stream/index.ts` (Backend SSE Endpoint - Reviewed)
*   `supabase/functions/notifications-stream/index.test.ts` (Backend SSE Tests - Reviewed)
*   `supabase/functions/_shared/types.ts` (Added local copy of `Notification` type)
*   `supabase/functions/_shared/test-utils.ts` (Used for backend testing)
*   `packages/types/src/notification.types.ts` (Read `Notification` type definition)

## Outstanding Issues / Challenges

1.  **Dropdown Visibility:** The `<Notifications />` dropdown content (`DropdownMenuContent`) is not visible when the trigger icon is clicked, despite the `isOpen` state toggling correctly and the element appearing in the DOM. 
    *   Tried adding `z-[51]` to `DropdownMenuContent` to overcome header's `z-50`, but this did not resolve the issue.
    *   Suspect CSS positioning, stacking context, or `shadcn/ui` portal behavior conflicts with the fixed header.
2.  **Frontend API Auth Error (401):** The initial data fetch call from `Notifications.tsx` to `GET /functions/v1/notifications` is failing with a 401 Unauthorized error.
    *   The console log indicates `API Error 401 on notifications: Missing authorization header`.
    *   This suggests the `Authorization: Bearer <token>` header is not being correctly included in the API request initiated by `api.notifications().fetchNotifications()`.

## To-Do / Next Steps

1.  **Debug Dropdown Visibility:** Investigate CSS (`position`, `z-index`, `overflow`, transforms), inspect element positioning in dev tools, and check `shadcn/ui` `DropdownMenu` (and potentially `Dialog` or `Portal`) documentation/behavior regarding fixed positioning contexts.
2.  **Debug API Call Authentication:**
    *   Verify the `token` state is correctly retrieved from `useAuthStore` in `Notifications.tsx`.
    *   Trace the API call through `@paynless/api` (`api.notifications().fetchNotifications()` -> `apiClient.get()`) to ensure the retrieved token is being attached to the `Authorization` header.
3.  **Complete Manual Testing (Phase 1.6):** Once the above issues are fixed, perform the manual checks (SSE updates, GET on load, click interactions, mark read).
4.  **Complete Checkpoint (Phase 1.7):** Run final tests, build, update docs, and commit.

## Other Context

*   Backend functions use Dependency Injection for testability (`deps` object containing `supabaseClient`).
*   Backend tests use the shared `createMockSupabaseClient` utility.
*   Custom types needed by Edge Functions are copied into `_shared/types.ts`.
*   Remember TDD principles for any further backend changes. 