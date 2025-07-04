# AI Dialectic: Realtime Contribution Streaming Implementation Plan

## Preamble

This document outlines the plan to refactor the AI Dialectic feature from a client-side polling mechanism to a real-time, event-driven model using Supabase Realtime. This will provide a more efficient and responsive user experience by streaming new AI contributions to the frontend as soon as they are created in the database.

This plan will strictly adhere to the formats, legends, and component types defined in `AI Dialectic Implementation Plan.md`.

**Goal:** To guide an AI development agent (and human developers) through the refactoring process, ensuring a seamless transition to a streaming architecture while maintaining code quality and reliability.

## Legend

*   `[ ]` Unstarted work step.
*   `[✅]` Represents a completed step.
*   `[🚧]` Represents an incomplete or partially completed step.
*   `[⏸️]` Represents a paused step.
*   `[❓]` Represents an uncertainty.
*   `[🚫]` Represents a blocked step.

## Component Types and Labels

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api`)
*   `[STORE]` State Management (`@paynless/store`)
*   `[UI]` Frontend Component (`apps/web`)
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update
*   `[DOCS]` Documentation Update
*   `[REFACTOR]` Code Refactoring Step
*   `[COMMIT]` Checkpoint for Git Commit

---

## Section 1: Phase 1 - Backend Enablement for Realtime

**Goal:** Configure the database and its security policies to enable authenticated clients to securely subscribe to changes on the `dialectic_contributions` table.

---

*   `[ ] 1.1 [DB]` **Enable Realtime Publication on `dialectic_contributions`**
    *   `[ ] 1.1.1 [DOCS]` Document the requirement to enable Realtime for the `dialectic_contributions` table via the Supabase Dashboard. This involves ensuring the table is part of the `supabase_realtime` publication, specifically for `INSERT` operations.
*   `[ ] 1.2 [RLS]` **Update RLS Policy for Realtime Subscription**
    *   `[ ] 1.2.1 [RLS/REFACTOR]` Review and refactor the `SELECT` policy on the `dialectic_contributions` table.
        *   The policy must allow a user to select contributions if they are the `user_id` on the `dialectic_projects` record associated with the contribution's `session_id`.
        *   This ensures that the Realtime subscription will only receive broadcasts for contributions they are authorized to see.
    *   `[ ] 1.2.2 [TEST-INT]` Write or update an RLS integration test to specifically validate the Realtime subscription scenario.
        *   The test should simulate two different users with two different projects.
        *   It should assert that User A, when subscribed, receives a broadcast for a new contribution in their own project.
        *   It should assert that User A does *not* receive a broadcast for a new contribution in User B's project.
*   `[ ] 1.3 [COMMIT]` feat(be,db): configure RLS and publication for realtime contribution streaming

---

## Section 2: Phase 2 - Frontend Refactoring to Streaming Client

**Goal:** Replace the polling logic in the frontend with a Supabase Realtime client subscription, managed within the Zustand store and triggered by the main session view component.

---

*   `[ ] 2.1 [STORE/REFACTOR]` **Refactor `dialecticStore.ts` for Subscription Management**
    *   `[ ] 2.1.1 [STORE]` Remove polling-related state from `DialecticStateValues`.
        *   Specifically, delete the `contributionPollingIntervalId: number | null` property.
    *   `[ ] 2.1.2 [STORE]` Add new Realtime-specific state to `DialecticStateValues`.
        *   `[ ]` Add `contributionSubscription: RealtimeChannel | null` to hold the active subscription channel object.
        *   `[ ]` Add `isSubscribedToContributions: boolean` to track connection status.
        *   `[ ]` Add `contributionSubscriptionError: string | null` for error handling.
    *   `[ ] 2.1.3 [STORE]` Create a new action: `subscribeToContributions(projectId: string)`.
        *   `[ ] 2.1.3.1 [TEST-UNIT]` Write unit tests for this new action, mocking the Supabase Realtime client.
        *   `[ ] 2.1.3.2` Implement the action logic:
            *   `[ ]` Check if a subscription already exists; if so, call the `unsubscribe` action first.
            *   `[ ]` Use the Supabase client (`getSupabaseClient()`) to create a new channel: `const channel = client.channel(...)`.
            *   `[ ]` Set up the `.on('postgres_changes', ...)` listener for `INSERT` events on `public.dialectic_contributions` where `project_id` matches the input `projectId`.
            *   `[ ]` The event callback (`handleContributionInsert`) will receive the `new` record. It must update the store's state by finding the correct session within `currentProjectDetail` and merging the new contribution into its `contributions` array. It should handle potential duplicates.
            *   `[ ]` The `.subscribe((status, err) => ...)` callback should update `isSubscribedToContributions` and `contributionSubscriptionError` based on the subscription status.
            *   `[ ]` Store the `channel` object in the `contributionSubscription` state property.
    *   `[ ] 2.1.4 [STORE]` Create a new action: `unsubscribeFromContributions()`.
        *   `[ ] 2.1.4.1 [TEST-UNIT]` Write unit tests for this action.
        *   `[ ] 2.1.4.2` Implement the action logic:
            *   `[ ]` Check if `get().contributionSubscription` exists.
            *   `[ ]` Call `supabase.removeChannel(get().contributionSubscription)`.
            *   `[ ]` Reset all subscription-related state (`contributionSubscription`, `isSubscribedToContributions`, `contributionSubscriptionError`) to their initial `null`/`false` values.
    *   `[ ] 2.1.5 [STORE/REFACTOR]` Deprecate and remove polling logic from the `generateContributions` thunk.
        *   `[ ]` Delete all code related to `setInterval` and `clearInterval`.
        *   `[ ]` Remove the logic that repeatedly called `fetchDialecticProjectDetails`.
        *   `[ ]` The thunk's responsibility is now simplified: it calls the backend API and sets a loading/generating status. The active Realtime subscription will handle receiving the results.
    *   `[ ] 2.1.6 [TEST-UNIT]` Run all updated `dialecticStore.test.ts` tests.

*   `[ ] 2.2 [UI/REFACTOR]` **Integrate Subscription Lifecycle into UI**
    *   `[ ] 2.2.1 [UI]` Modify `DialecticSessionDetailsPage.tsx`.
        *   `[ ]` Within a `useEffect` hook that runs when `projectId` is available:
            *   Dispatch the `subscribeToContributions(projectId)` action.
            *   The `useEffect`'s return (cleanup) function must dispatch `unsubscribeFromContributions()`. This is critical to prevent memory leaks and duplicate channels when navigating away from the page.
    *   `[ ] 2.2.2 [TEST-UNIT]` Update tests for `DialecticSessionDetailsPage.tsx`.
        *   `[ ]` Verify that `subscribeToContributions` is dispatched on component mount.
        *   `[ ]` Verify that `unsubscribeFromContributions` is dispatched on component unmount.

*   `[ ] 2.3 [COMMIT]` refactor(store,ui): replace polling with Supabase Realtime streaming for contributions 