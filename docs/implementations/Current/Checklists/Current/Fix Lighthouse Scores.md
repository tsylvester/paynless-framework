# Frontend Performance Optimization: Bundle Size Reduction

## Preamble

This document outlines the detailed, step-by-step implementation plan to significantly improve the web application's Lighthouse performance score by reducing the initial JavaScript bundle size. The current bundle size is unacceptably large, leading to slow page load times and a poor user experience.

This plan will focus on two primary strategies:
1.  **Code Splitting:** Implementing route-based lazy loading to ensure users only download the code they need for the view they are currently interacting with.
2.  **Server-Side Logic Migration:** Identifying and moving large, computationally expensive libraries that are not essential for initial render from the client-side bundle to a backend service.

The implementation will strictly follow the Test-Driven Development (TDD) approach where applicable and adhere to the existing monorepo architecture.

**Goal:** To guide a developer through the implementation process, ensuring the application's bundle size is drastically reduced, leading to a measurable improvement in Lighthouse scores and a faster, more responsive user experience.

## Project Success Metrics

*   **Lighthouse Performance Score:** Increase the mobile performance score to > 80.
*   **Initial JS Bundle Size:** Reduce the main `index.js` chunk to less than 1MB (gzipped).
*   **Total Blocking Time (TBT):** Decrease TBT to be within the "Good" range (< 200ms).
*   **First Contentful Paint (FCP):** Decrease FCP to be within the "Good" range (< 1.8s).

## Risk Assessment and Mitigation Strategies

*   **Risk: Breaking Changes from Asynchronous Refactoring:**
    *   **Mitigation:** Hooks and components that are refactored from synchronous to asynchronous will have their return types and consumption patterns changed. A systematic, global search for all usages of the refactored component will be performed to ensure every instance is updated correctly. Unit and integration tests are critical.
*   **Risk: Increased Perceived Latency:**
    *   **Mitigation:** Moving logic to the server introduces network latency. The UI must be updated to provide immediate feedback (e.g., loading spinners, disabled buttons) to the user while the server-side calculation is in progress.
*   **Risk: Incomplete Test Coverage:**
    *   **Mitigation:** The plan explicitly includes steps to write or update unit and integration tests for every change, following the Red-Green-Refactor cycle. No feature will be considered complete until its tests are passing.

## Legend

*   `[ ]` Unstarted work step.
*   `[✅]` Represents a completed step.
*   `[🚧]` Represents an incomplete or partially completed step.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.

## Component Types and Labels

*   `[BE]` Backend Logic (Edge Function)
*   `[API]` API Client Library (`@paynless/api`)
*   `[STORE]` State Management (`@paynless/store`)
*   `[UI]` Frontend Component (in `apps/web`)
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update
*   `[DOCS]` Documentation Update
*   `[REFACTOR]` Code Refactoring Step
*   `[CONFIG]` Configuration changes
*   `[COMMIT]` Checkpoint for Git Commit

---

## Section 1: Route-Based Code Splitting

**Goal:** Ensure that the code for each page (route) is only loaded when the user navigates to it. This is the first line of defense against large bundles.

---
*   `[✅] 1.1 [UI/REFACTOR]` **Lazy Load Page Components**
    *   `[✅] 1.1.1` In `apps/web/src/routes/routes.tsx`, import `lazy` from `react`.
    *   `[✅] 1.1.2` Convert all static page component imports (e.g., `import { LoginPage } from ...`) to use the `lazy()` function (e.g., `const LoginPage = lazy(...)`).
    *   `[✅] 1.1.3` Ensure the conversion correctly handles both named and default exports.
*   `[✅] 1.2 [UI/REFACTOR]` **Implement Suspense Fallback**
    *   `[✅] 1.2.1` In the root layout component (`apps/web/src/components/routes/RootRoute.tsx`), import `Suspense` from `react`.
    *   `[✅] 1.2.2` Wrap the `<Outlet />` component with `<Suspense fallback={...}>` to provide a loading UI while page chunks are being fetched.
*   `[✅] 1.3 [CONFIG]` **Analyze Bundle Composition**
    *   `[✅] 1.3.1` Install `rollup-plugin-visualizer` as a dev dependency in the `apps/web` workspace.
    *   `[✅] 1.3.2` Update `apps/web/vite.config.ts` to include the visualizer plugin.
    *   `[✅] 1.3.3` Run a production build and analyze the output to confirm `js-tiktoken` is the main issue.
*   `[✅] 1.4 [COMMIT]` feat(web): implement route-based code splitting

---

## Section 2: Migrate Token Calculation to Server-Side

**Goal:** For the best performance and smallest bundle, move the token counting logic entirely to the backend, removing the `js-tiktoken` dependency from the frontend bundle altogether.

---
*   `[ ] 2.1 [BE]` **Create Server-Side Endpoint for Token Estimation**
    *   `[ ] 2.1.1` Create a new Supabase Edge Function: `utils-service`.
    *   `[ ] 2.1.2` Add an action `estimateTokens` to this service.
        *   The action will accept a payload: `{ textOrMessages: string | MessageForTokenCounting[], modelConfig: AiModelExtendedConfig }`.
        *   The implementation will be the logic currently in `packages/utils/src/tokenCostUtils.ts`. This function will now import `js-tiktoken` on the server, not the client.
    *   `[ ] 2.1.3 [TEST-INT]` Write integration tests for the `estimateTokens` action.
*   `[ ] 2.2 [API]` **Update API Client**
    *   `[ ] 2.2.1` Add a new method `estimateTokens(payload)` to the `@paynless/api` client that invokes the new `utils-service` Edge Function.
    *   `[ ] 2.2.2 [TEST-UNIT]` Write unit tests for the new API client method.
*   `[ ] 2.3 [UI/REFACTOR]` **Refactor `useTokenEstimator` to use the API**
    *   `[ ] 2.3.1` Modify `apps/web/src/hooks/useTokenEstimator.ts`.
        *   `[ ]` The hook must become asynchronous, changing its signature to return an object: `{ estimatedTokens: number; isLoading: boolean; }`.
        *   `[ ]` The implementation should use `useState` and `useEffect`. The `useEffect` will call the new API client method from `2.2.1`.
        *   `[ ]` It must manage a loading state while waiting for the server's response.
    *   `[ ] 2.3.2 [TEST-UNIT]` Update tests in `apps/web/src/hooks/useTokenEstimator.test.ts`.
        *   `[ ]` Mock the API client call.
        *   `[ ]` Update tests to assert the new return shape `{ estimatedTokens, isLoading }`.
        *   `[ ]` Use `waitFor` or other async testing utilities to test the hook's behavior.
*   `[ ] 2.4 [UI/REFACTOR]` **Update Components Consuming `useTokenEstimator`**
    *   `[ ] 2.4.1` Systematically find all components that use `useTokenEstimator` (e.g., `CurrentMessageTokenEstimator`, `ChatInput`, `ChatAffordabilityIndicator`) and update them to handle the new asynchronous return type. This involves destructuring `{ estimatedTokens, isLoading }` and handling the loading state appropriately.
    *   `[ ] 2.4.2 [TEST-UNIT]` Update all relevant component unit tests to mock the new asynchronous hook behavior and test the loading states.
*   `[ ] 2.5 [REFACTOR]` **Final Cleanup**
    *   `[ ] 2.5.1` Delete the `packages/utils/src/tokenCostUtils.ts` file as it's no longer needed on the client.
    *   `[ ] 2.5.2` Run a production build with the bundle analyzer to confirm that `js-tiktoken` and `tokenCostUtils.ts` are no longer included in any client-side bundle.
*   `[ ] 2.6 [COMMIT]` feat(perf): move token estimation to server-side and refactor consumers
