# Implementation Plan: Tauri Environment-Specific UI

**Goal:** Implement conditional rendering in the web app frontend, allowing specific UI sections (e.g., for file system operations) to be displayed only when the application is running within a Tauri desktop environment that has detected the necessary capabilities (like file system access).

## Legend

*   [ ] Each work step will be uniquely named for easy reference
    *   [ ] Worksteps will be nested as shown
        *   [ ] Nesting can be as deep as logically required
*   [✅] Represents a completed step or nested set
*   [🚧] Represents an incomplete or partially completed step or nested set
*   [⏸️] Represents a paused step where a discovery has been made that requires backtracking
*   [❓] Represents an uncertainty that must be resolved before continuing
*   [🚫] Represents a blocked, halted, stopped step or nested set that has some unresolved problem or prior dependency to resolve before continuing

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   **[RUST]:** Rust Backend Logic (Tauri Core)
*   **[TS]:** Frontend Logic (TypeScript/JavaScript)
*   **[UI]:** Frontend Component/Rendering (`apps/web` or similar)
*   **[TEST-UNIT]:** Unit Test Implementation/Update
*   **[TEST-INT]:** Integration Test Implementation/Update (Frontend-Backend Interaction)
*   **[REFACTOR]:** Code Refactoring Step
*   **[COMMIT]:** Checkpoint for Git Commit

## Implementation Plan Overview

This implementation plan follows a phased approach:

1.  **Investigation & Planning:** Analyze the current codebase and plan the implementation strategy.
2.  **Backend Implementation (Rust):** Create and expose a Tauri command to report environment capabilities.
3.  **Frontend Implementation (TS):** Invoke the Tauri command and manage capability state.
4.  **UI Integration:** Implement conditional rendering based on the capability state.
5.  **Testing & Refinement:** Comprehensive testing and final adjustments.
6.  **Documentation:** Update relevant documentation.

---

## Phase 0: Investigation & Planning

### STEP-0.1: Understand Current State [🚧]

#### STEP-0.1.1: Locate Environment Detection Logic [RUST]
*   [ ] Identify the existing Rust code (likely in `src-tauri/src/`) responsible for detecting the operating environment or specific capabilities (e.g., file system access).
*   [ ] Document the file path(s) and function names involved.
*   [ ] Understand how capabilities are currently determined (e.g., OS checks, config files, environment variables).

#### STEP-0.1.2: Review Tauri Command Setup [RUST]
*   [ ] Examine `src-tauri/src/main.rs` (or relevant setup file).
*   [ ] Identify how Tauri commands are currently registered (`.invoke_handler(...)`).
*   [ ] Document the existing command registration pattern.

#### STEP-0.1.3: Identify Frontend Framework & Entry Point [TS] [UI]
*   [ ] Determine the frontend framework being used (e.g., React, Vue, Svelte, Angular).
*   [ ] Locate the main application entry point component (e.g., `App.tsx`, `main.ts`).
*   [ ] Identify the primary state management solution, if any (e.g., Zustand, Redux, Pinia, Context API).

#### STEP-0.1.4: Identify Target UI Components [UI]
*   [ ] List the specific UI components or sections within the web app that should only be rendered when file system access (or other specific capabilities) is available.
*   [ ] Document the file paths for these components.

### STEP-0.2: Gap Analysis & Planning [🚧]

#### STEP-0.2.1: Analyze Gaps Based on Proposed Solution
*   [ ] Confirm if a dedicated Tauri command exists for exposing capabilities. (Likely need to create one).
*   [ ] Confirm if the frontend currently fetches or stores environment capability information. (Likely need to implement).
*   [ ] Confirm if conditional rendering logic exists for the target UI components based on environment. (Likely need to implement).

#### STEP-0.2.2: Plan Rust Implementation [RUST]
*   [ ] Define the structure of the Rust struct to hold capability flags (e.g., `AppEnvironment { is_tauri: bool, has_fs_access: bool }`). Must derive `serde::Serialize` and `Clone`.
*   [ ] Define the signature for the new Tauri command (e.g., `#[tauri::command] fn get_environment_capabilities() -> AppEnvironment`).
*   [ ] Plan how to integrate existing detection logic into the new command function.

#### STEP-0.2.3: Plan Frontend Implementation [TS]
*   [ ] Define the corresponding TypeScript interface for the capability struct.
*   [ ] Plan the state management approach (e.g., add state variables to the main App component or a dedicated context/store).
*   [ ] Outline the logic for the `useEffect` hook (or equivalent lifecycle method) to invoke the Tauri command.
*   [ ] Plan error handling for the command invocation.

#### STEP-0.2.4: Plan UI Integration [UI]
*   [ ] Determine the exact conditional rendering logic (e.g., `if (environment.isTauri && environment.hasFsAccess) { ... }`).
*   [ ] Plan where this logic will reside (e.g., wrapping the target components).

#### STEP-0.2.5: Outline Test Plan [TEST-UNIT] [TEST-INT]
*   [ ] Define unit tests for the Rust capability detection logic and the command function.
*   [ ] Define unit tests for the frontend state management and command invocation logic.
*   [ ] Define unit/integration tests for the conditional rendering of UI components.
*   [ ] Outline manual end-to-end test scenarios (Web environment, Tauri w/ FS, Tauri w/o FS if applicable).

---

## Phase 1: Backend Implementation (Rust)

### STEP-1.1: Implement Capability Struct [RUST] [🚧]

#### STEP-1.1.1: Define Struct [TEST-UNIT] [COMMIT]
*   [ ] Create unit tests for the struct definition (basic property checks).
*   [ ] Define the `AppEnvironment` struct in `src-tauri/src/main.rs` or a suitable module:
    ```rust
    #[derive(Clone, serde::Serialize)]
    struct AppEnvironment {
      is_tauri: bool,
      has_fs_access: bool,
      // Add other flags as needed
    }
    ```
*   [ ] Run unit tests.
*   [ ] Build the Tauri application (`cargo tauri build` or `dev`) to ensure compilation.
*   [ ] Commit changes with message "feat(RUST): Define AppEnvironment struct for capabilities".

### STEP-1.2: Implement Capability Detection Function [RUST] [🚧]

#### STEP-1.2.1: Create or Refactor Detection Logic [TEST-UNIT] [REFACTOR] [COMMIT]
*   [ ] Create unit tests for the capability detection logic. Ensure different scenarios (e.g., different OS, env vars) are covered if applicable.
*   [ ] Create a new function or refactor existing logic identified in STEP-0.1.1 into a dedicated function (e.g., `fn detect_capabilities() -> AppEnvironment`) within `src-tauri/src/main.rs` or a suitable module.
*   [ ] This function should encapsulate all checks and return an instance of `AppEnvironment`.
*   [ ] Ensure `is_tauri` is appropriately set (likely always `true` within a Tauri command context, but confirm).
*   [ ] Run unit tests.
*   [ ] Build the Tauri application to ensure compilation.
*   [ ] Commit changes with message "feat(RUST): Implement detect_capabilities function".

### STEP-1.3: Implement Tauri Command [RUST] [🚧]

#### STEP-1.3.1: Create Command Function [TEST-UNIT] [COMMIT]
*   [ ] Create unit tests for the command function (mocking `detect_capabilities` if complex, or testing integration).
*   [ ] Define the Tauri command function in `src-tauri/src/main.rs` or a suitable module:
    ```rust
    #[tauri::command]
    fn get_environment_capabilities() -> AppEnvironment {
        detect_capabilities()
    }
    ```
*   [ ] Run unit tests.
*   [ ] Build the Tauri application.
*   [ ] Commit changes with message "feat(RUST): Implement get_environment_capabilities command".

### STEP-1.4: Register Tauri Command [RUST] [🚧]

#### STEP-1.4.1: Update Invoke Handler [TEST-INT] [COMMIT]
*   [ ] Prepare integration tests (can be manual at this stage) to verify the command is callable from the frontend later.
*   [ ] Update the `.invoke_handler` in `src-tauri/src/main.rs`:
    ```rust
    fn main() {
        tauri::Builder::default()
            .invoke_handler(tauri::generate_handler![
                get_environment_capabilities, // Add the new command
                // other existing commands...
            ])
            // ... rest of the builder chain
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
    ```
*   [ ] Build the Tauri application to ensure compilation.
*   [ ] Run the Tauri application in dev mode (`cargo tauri dev`). No frontend changes yet, just ensure it runs without crashing.
*   [ ] Commit changes with message "feat(RUST): Register get_environment_capabilities command".

---

## Phase 2: Frontend Implementation (TypeScript/JS)

### STEP-2.1: Define Frontend Types [TS] [🚧]

#### STEP-2.1.1: Create Capability Interface [TEST-UNIT] [COMMIT]
*   [ ] Create unit tests for the type definition (basic property checks).
*   [ ] Define a TypeScript interface matching the Rust struct in a relevant types file (e.g., `src/types/environment.ts` or similar):
    ```typescript
    interface AppEnvironment {
      // Use camelCase matching expected JSON from Tauri
      isTauri: boolean;
      hasFsAccess: boolean;
      // Add other flags corresponding to Rust struct
    }
    ```
*   [ ] Run unit tests (if applicable for types).
*   [ ] Build the frontend application (`npm run build`, `pnpm build`, etc.) to ensure compilation.
*   [ ] Commit changes with message "feat(TS): Define AppEnvironment interface for frontend".

### STEP-2.2: Implement State Management [TS] [🚧]

#### STEP-2.2.1: Add State Variables [TEST-UNIT] [COMMIT]
*   [ ] Create unit tests for the initial state and state updates.
*   [ ] In the main App component (`App.tsx` or equivalent) or a dedicated context/store:
    *   [ ] Add state to hold the `AppEnvironment`. Initialize with default web values (e.g., `isTauri: false, hasFsAccess: false`).
    *   [ ] Add a loading state variable (e.g., `isLoadingCapabilities: true`).
*   [ ] Run unit tests.
*   [ ] Build the frontend application.
*   [ ] Commit changes with message "feat(TS): Add state for environment capabilities".

### STEP-2.3: Implement Command Invocation [TS] [🚧]

#### STEP-2.3.1: Install Tauri API Package (if needed) [COMMIT]
*   [ ] Check `package.json` for `@tauri-apps/api`.
*   [ ] If missing, install it: `npm install @tauri-apps/api` or `pnpm add @tauri-apps/api` or `yarn add @tauri-apps/api`.
*   [ ] Commit changes if package was added.

#### STEP-2.3.2: Implement Effect Hook for Invocation [TEST-UNIT] [COMMIT]
*   [ ] Create unit tests for the effect hook logic (mocking `invoke`).
*   [ ] In the main App component or context/store, implement a `useEffect` (React) or equivalent lifecycle hook:
    *   [ ] Import `invoke` from `@tauri-apps/api/tauri`.
    *   [ ] Check if `window.__TAURI__` exists.
    *   [ ] If yes:
        *   [ ] Call `invoke<AppEnvironment>('get_environment_capabilities')`.
        *   [ ] Use `.then()` to handle success: update the capability state with the response, set loading state to `false`. Be mindful of potential snake_case vs camelCase differences in the response keys from Rust.
        *   [ ] Use `.catch()` to handle errors: log the error, potentially set default capabilities (e.g., `isTauri: true, hasFsAccess: false`), set loading state to `false`.
    *   [ ] If no (`window.__TAURI__` is missing):
        *   [ ] Set capability state to default web values (`isTauri: false, hasFsAccess: false`).
        *   [ ] Set loading state to `false`.
    *   [ ] Ensure the effect runs only once on mount (e.g., empty dependency array `[]` in React).
*   [ ] Run unit tests.
*   [ ] Build the frontend application.
*   [ ] Commit changes with message "feat(TS): Implement command invocation for capabilities".

#### STEP-2.3.3: Verify Invocation in Development [TEST-INT] [COMMIT]
*   [ ] Add temporary logging inside the `.then()` and `.catch()` blocks of the `invoke` call.
*   [ ] Run the application in Tauri dev mode (`cargo tauri dev`).
*   [ ] Open the browser developer console (usually F12).
*   [ ] Verify that the command is invoked and the correct capability data (or an error) is logged.
*   [ ] Remove temporary logging.
*   [ ] Commit if any adjustments were needed.

---

## Phase 3: UI Integration & Conditional Rendering

### STEP-3.1: Implement Conditional Rendering [UI] [🚧]

#### STEP-3.1.1: Wrap Target UI Components [TEST-UNIT] [COMMIT]
*   [ ] Create unit tests to verify the conditional rendering logic based on mock capability state.
*   [ ] Locate the UI components identified in STEP-0.1.4.
*   [ ] Wrap these components/sections with conditional rendering logic using the state variable(s) holding the capabilities:
    ```jsx
    // Example for React
    {isLoadingCapabilities ? (
      <LoadingSpinner /> // Optional: Show loading indicator
    ) : (
      environment.isTauri && environment.hasFsAccess && (
        <FileSystemSpecificUI />
      )
    )}

    // Or without loading state shown here:
    {environment.isTauri && environment.hasFsAccess && (
      <FileSystemSpecificUI />
    )}
    ```
*   [ ] Ensure the logic correctly checks for both `isTauri` and the specific capability flag (`hasFsAccess`).
*   [ ] Create placeholder components (like `<FileSystemSpecificUI />`) if the actual components don't exist yet or need refactoring.
*   [ ] Run unit tests.
*   [ ] Build the frontend application.
*   [ ] Commit changes with message "feat(UI): Implement conditional rendering for capability-specific UI".

### STEP-3.2: Test Conditional Rendering Manually [TEST-INT] [COMMIT]

#### STEP-3.2.1: Test in Web Environment
*   [ ] Run the web app standalone (e.g., `npm run dev`, `pnpm dev`).
*   [ ] Verify that the capability-specific UI sections are *not* rendered.

#### STEP-3.2.2: Test in Tauri Environment (With Capabilities)
*   [ ] Ensure your Rust `detect_capabilities` function is currently returning `has_fs_access: true` for your test environment.
*   [ ] Run the application in Tauri dev mode (`cargo tauri dev`).
*   [ ] Verify that the capability-specific UI sections *are* rendered correctly.

#### STEP-3.2.3: Test in Tauri Environment (Without Capabilities - Optional)
*   [ ] If possible/relevant, temporarily modify `detect_capabilities` to return `has_fs_access: false`.
*   [ ] Rebuild and run the application in Tauri dev mode.
*   [ ] Verify that the capability-specific UI sections are *not* rendered.
*   [ ] Revert the temporary change in `detect_capabilities`.

#### STEP-3.2.4: Commit Verification Results
*   [ ] Commit changes with message "test(UI): Manually verified conditional rendering logic".

---

## Phase 4: Refinement & Testing

### STEP-4.1: Implement Loading/Error States [UI] [🚧]

#### STEP-4.1.1: Add Loading Indicators [REFACTOR] [COMMIT]
*   [ ] If not already done in STEP-3.1.1, implement loading indicators (e.g., spinners, skeletons) while the capabilities are being fetched (`isLoadingCapabilities` state).
*   [ ] Ensure the loading state provides good user feedback.
*   [ ] Build and test visually.
*   [ ] Commit changes with message "feat(UI): Add loading state during capability detection".

#### STEP-4.1.2: Refine Error Handling [REFACTOR] [COMMIT]
*   [ ] Review the error handling in the `invoke().catch()` block (STEP-2.3.2).
*   [ ] Implement user-friendly error display if the command fails (e.g., a subtle notification or default behavior). Avoid crashing the app.
*   [ ] Build and test error handling (e.g., by temporarily renaming the Rust command to force an error).
*   [ ] Revert any temporary changes made for testing errors.
*   [ ] Commit changes with message "refactor(TS): Refine error handling for capability detection".

### STEP-4.2: Final End-to-End Testing [TEST-INT] [🚧]

#### STEP-4.2.1: Perform Comprehensive E2E Tests
*   [ ] Repeat the manual tests from STEP-3.2, ensuring all loading, error, and conditional rendering states work as expected in both web and Tauri environments.
*   [ ] Test interactions within the conditionally rendered components (if they exist).

### STEP-4.3: Code Review [🚧]

#### STEP-4.3.1: Review Backend Code [RUST]
*   [ ] Review Rust code for clarity, correctness, efficiency, and adherence to standards.
*   [ ] Ensure proper error handling and serialization.

#### STEP-4.3.2: Review Frontend Code [TS] [UI]
*   [ ] Review TypeScript/JavaScript code for clarity, correctness, efficiency, and adherence to standards.
*   [ ] Review state management logic.
*   [ ] Review conditional rendering implementation.
*   [ ] Review component structure and props.

#### STEP-4.3.3: Address Review Feedback [REFACTOR] [COMMIT]
*   [ ] Implement any changes suggested during code review.
*   [ ] Commit final changes post-review.

---

## Phase 5: Documentation

### STEP-5.1: Update Development Documentation [🚧]

#### STEP-5.1.1: Document Capability Detection [COMMIT]
*   [ ] Add a section to internal developer documentation explaining:
    *   How environment capabilities are detected in Rust.
    *   The `get_environment_capabilities` Tauri command and its purpose.
    *   The `AppEnvironment` struct/interface.
*   [ ] Commit documentation changes with message "docs: Document backend capability detection".

#### STEP-5.1.2: Document Conditional Rendering [COMMIT]
*   [ ] Add a section to internal developer documentation explaining:
    *   How the frontend fetches capabilities using `invoke`.
    *   How capability state is managed.
    *   The pattern used for conditionally rendering UI components based on capabilities.
*   [ ] Commit documentation changes with message "docs: Document frontend conditional rendering pattern".

--- 