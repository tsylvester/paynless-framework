# Implementation Plan: WalletBackupDemo Component

**Goal:** Implement a demonstration UI component (`WalletBackupDemoCard` and its sub-components) to showcase the integration of the Platform Capability Abstraction Layer (`@paynless/platform`) for essential file system operations (reading, writing, picking files/save locations) within the context of a core application need: mnemonic phrase backup and recovery. This component will serve as a pattern for integrating platform capabilities into other features while adhering to the project's layered architecture and security principles.

**Scope:** This plan focuses *solely* on the frontend implementation of the `WalletBackupDemoCard` and its sub-components (`MnemonicInputArea`, `FileActionButtons`, `StatusDisplay`) and their interaction with the `@paynless/platform` service. It **explicitly excludes** the implementation of any cryptographic validation, seed derivation, or secure storage logic; those functionalities belong in the Rust backend (`core-crypto`, `storage-layer`) and will be accessed via Tauri bridge commands in production components.

## Guiding Principles

*   **Clear Demonstration:** The component should clearly illustrate the use of `usePlatform` hook and the relevant `fileSystem` capabilities (`pickFile`, `readFile`, `pickSaveFile`, `writeFile`).
*   **Layered Architecture Adherence:** The component interacts only with the platform abstraction layer, not directly with Tauri APIs or backend crypto logic.
*   **Component Structure:** Follow project conventions by breaking the feature into smaller, focused sub-components orchestrated by a container card.
*   **User Experience:** Provide clear feedback to the user during operations (loading states using skeletons, success messages, informative error messages). Handle user cancellation gracefully.
*   **Safety:** Utilize platform dialogs for user confirmation of file read/write locations. Use `ErrorBoundary` for robustness.
*   **Maintainability:** Keep components focused and well-structured.

## Implementation Plan

**Phase 1: WalletBackupDemo Component Implementation [🚧 In Progress]**

*   **[1.1] `WalletBackupDemoCard` Setup & Structure [🚧]:**
    *   [X] Create the main container component file: `apps/web/src/components/demos/WalletBackupDemo/WalletBackupDemoCard.tsx`.
    *   [X] Create the corresponding unit test file: `apps/web/src/components/demos/WalletBackupDemo/WalletBackupDemoCard.test.tsx`.
    *   [X] Define basic component structure for `WalletBackupDemoCard`.
    *   [X] Update tests for TDD: Add failing tests for loading, unavailable, and available states.
    *   [ ] Add the `WalletBackupDemoCard` component to a relevant storybook or development page for easy visualization.
    *   [ ] [COMMIT] Commit initial card component structure and tests with message "feat(UI): Add initial WalletBackupDemoCard structure and tests".

*   **[1.2] `MnemonicInputArea` Implementation & Tests [✅]:**
    *   [X] Create the `MnemonicInputArea.tsx` sub-component file.
    *   **[1.2.1] Write Unit Tests (`MnemonicInputArea.test.tsx`) [TEST-UNIT] [X]:**
        *   [X] Create test file: `apps/web/src/components/demos/WalletBackupDemo/MnemonicInputArea.test.tsx`.
        *   [X] Test Case 1: Renders the `Textarea` component.
        *   [X] Test Case 2: Displays the `value` prop correctly in the textarea.
        *   [X] Test Case 3: Calls the `onChange` prop function with the new value when text is entered.
        *   [X] Test Case 4: Applies the `disabled` attribute to the textarea when the `disabled` prop is true.
        *   [X] Test Case 5: Does not apply the `disabled` attribute when the `disabled` prop is false.
        *   [X] Commit failing tests: "test(UI): Add unit tests for MnemonicInputArea component".
    *   **[1.2.2] Implement Component Logic [UI] [X]:**
        *   [X] In `MnemonicInputArea.tsx`, implement the component using `Textarea` from `@/components/ui/textarea`.
        *   [X] Ensure props (`value`, `onChange`, `disabled`) are correctly passed to the underlying `Textarea`.
        *   [X] Verify all unit tests pass.
    *   **[1.2.3] Commit `MnemonicInputArea` [COMMIT] [✅]:**
        *   [X] Commit working component and passing tests: "feat(UI): Implement MnemonicInputArea component and tests".

*   **[1.3] `GenerateMnemonicButton` Implementation & Tests [✅]:** (New Step)
    *   **[1.3.1] Write Unit Tests (`GenerateMnemonicButton.test.tsx`) [TEST-UNIT] [X]:**
        *   [X] Create test file: `apps/web/src/components/demos/WalletBackupDemo/GenerateMnemonicButton.test.tsx`.
        *   [X] Test Case 1: Renders a button with text "Generate Mnemonic".
        *   [X] Test Case 2: Calls the `onGenerate` prop function when clicked (and not disabled).
        *   [X] Test Case 3: Applies the `disabled` attribute when the `disabled` prop is true.
        *   [X] Commit failing tests: "test(UI): Add unit tests for GenerateMnemonicButton component".
    *   **[1.3.2] Implement Component Logic [UI] [X]:**
        *   [X] Create the `GenerateMnemonicButton.tsx` file.
        *   [X] Implement the component using `Button` from `@/components/ui/button`.
        *   [X] Ensure props (`onGenerate`, `disabled`) are handled correctly.
        *   [X] Verify all unit tests pass.
    *   **[1.3.3] Commit `GenerateMnemonicButton` [COMMIT] [X]:**
        *   [X] Commit working component and passing tests: "feat(UI): Implement GenerateMnemonicButton component and tests".

*   **[1.4] `FileActionButtons` Implementation & Tests [🚧]:** (Was 1.3)
    *   [X] Create the `FileActionButtons.tsx` sub-component file.
    *   **[1.4.1] Write Unit Tests (`FileActionButtons.test.tsx`) [TEST-UNIT] [X]:** (Renumbered)
        *   [X] Create test file: `apps/web/src/components/demos/WalletBackupDemo/FileActionButtons.test.tsx`.
        *   [X] Test Case 1: Renders "Import" and "Export" buttons.
        *   [X] Test Case 2: Calls `onImport` prop when Import button is clicked (and not disabled/loading).
        *   [X] Test Case 3: Calls `onExport` prop when Export button is clicked (and not disabled/loading).
        *   [X] Test Case 4: Disables both buttons when `disabled` prop is true.
        *   [X] Test Case 5: Disables *only* the Export button when `isExportDisabled` is true (and `disabled` is false).
        *   [X] Test Case 6: Shows `Loader2` spinner and disables both buttons when `isLoading` prop is true.
        *   [X] Commit failing tests: "test(UI): Add unit tests for FileActionButtons component".
    *   **[1.4.2] Implement Component Logic [UI] [X]:** (Renumbered)
        *   [X] In `FileActionButtons.tsx`, implement the component using `Button` from `@/components/ui/button` and `Loader2` from `lucide-react`.
        *   [X] Implement the logic for combined disabled states based on `disabled`, `isExportDisabled`, and `isLoading` props.
        *   [X] Implement conditional rendering for the `Loader2` spinner.
        *   [X] Verify all unit tests pass.
    *   **[1.4.3] Commit `FileActionButtons` [COMMIT] [X]:** (Renumbered)
        *   [X] Commit working component and passing tests: "feat(UI): Implement FileActionButtons component and tests".

*   **[1.5] `StatusDisplay` Implementation & Tests [✅]:** (Was 1.4)
    *   [X] Create the `StatusDisplay.tsx` sub-component file.
    *   **[1.5.1] Write Unit Tests (`StatusDisplay.test.tsx`) [TEST-UNIT] [X]:** (Renumbered)
        *   [X] Create test file: `apps/web/src/components/demos/WalletBackupDemo/StatusDisplay.test.tsx`.
        *   [X] Test Case 1: Renders nothing when `message` prop is null or empty.
        *   [X] Test Case 2: Renders `Alert` with correct `message` prop.
        *   [X] Test Case 3: Renders correct icon (`Info`, `CheckCircle`, `AlertCircle`) based on `variant` prop (`info`, `success`, `error`).
        *   [X] Test Case 4: Renders correct `AlertTitle` based on `variant`.
        *   [X] Test Case 5: Applies correct `variant` prop ('default' or 'destructive') to the `Alert` component.
        *   [X] Commit failing tests: "test(UI): Add unit tests for StatusDisplay component".
    *   **[1.5.2] Implement Component Logic [UI] [X]:** (Renumbered)
        *   [X] In `StatusDisplay.tsx`, implement the component using `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert` and icons from `lucide-react`.
        *   [X] Implement the logic to select the correct icon, title, and alert variant based on the `variant` prop.
        *   [X] Verify all unit tests pass.
    *   **[1.5.3] Commit `StatusDisplay` [COMMIT] [X]:** (Renumbered)
        *   [X] Commit working component and passing tests: "feat(UI): Implement StatusDisplay component and tests".

*   **[1.6] Integrate Sub-Components into `WalletBackupDemoCard` [✅]:** (Was 1.5)
    *   *Prerequisite: Steps 1.2, 1.3, 1.4, 1.5 completed.*
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Import and use the `usePlatform` hook.
        *   [X] Add state management (e.g., `useState`) for `mnemonic`, `statusMessage`, `statusVariant`, `isActionLoading`.
        *   [X] Implement logic to determine `isFileSystemAvailable` and `isDisabled` based on hook results and action state.
        *   [X] Implement conditional rendering for loading state (using `Skeleton` components).
        *   [X] Implement conditional rendering for capability error state.
        *   [X] Implement conditional rendering for unavailable state (showing message).
        *   [X] Render the now implemented sub-components (`MnemonicInputArea`, `GenerateMnemonicButton`, `FileActionButtons`, `StatusDisplay`), passing the necessary state and handlers (placeholder handlers for import/export) as props.
        *   [X] Wrap the main content in the `ErrorBoundary` component.
    *   [X] Update tests in `WalletBackupDemoCard.test.tsx` to verify sub-components are rendered correctly in available/unavailable states (mocking platform hook).
    *   [X] Verify tests pass.
    *   [X] [COMMIT] Commit sub-component integration in WalletBackupDemoCard with message "feat(UI): Integrate sub-components into WalletBackupDemoCard".

*   **[1.7] Implement Mnemonic Generation Logic in `WalletBackupDemoCard` [✅]:** (New Step)
    *   *Prerequisite: Step 1.6 completed.*
    *   [X] Add dependency (`ethers` or `bip39`) to `apps/web` (`pnpm --filter web add ethers` or `pnpm --filter web add bip39`).
    *   [X] In `WalletBackupDemoCard.test.tsx`:
        *   [X] Add tests for the generation workflow:
            *   [X] Simulate Generate button click.
            *   [X] Verify `mnemonic` state is updated with a valid-looking phrase (e.g., 12 or 24 words). 
            *   [X] Verify success status is displayed.
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Implement `handleGenerate` function:
            *   [X] Import the generation function (e.g., `ethers.Wallet.createRandom().mnemonic.phrase` or `bip39.generateMnemonic()`).
            *   [X] Call the function to get a new mnemonic.
            *   [X] Update `mnemonic` state using `setMnemonic`.
            *   [X] Set success status message.
        *   [X] Pass `handleGenerate` to the `GenerateMnemonicButton` component.
        *   [X] Verify all generation tests pass.
        *   [X] [COMMIT] Commit mnemonic generation functionality and tests with message "feat(UI): Implement mnemonic generation in WalletBackupDemoCard".

*   **[1.8] Implement Import Functionality in `WalletBackupDemoCard` [🚧]:** (Was 1.6)
    *   *Prerequisite: Step 1.7 completed.*
    *   [X] In `WalletBackupDemoCard.test.tsx`:
        *   [X] Add tests for the import workflow:
            *   [X] Mock `platformCapabilities.fileSystem.pickFile` to return null (user cancel).
            *   [X] Simulate Import button click, verify no state change / appropriate status.
            *   [X] Mock `pickFile` to return a file path.
            *   [X] Mock `platformCapabilities.fileSystem.readFile` to throw an error.
            *   [X] Simulate Import click, verify loading state, verify `pickFile` and `readFile` called, verify error status displayed.
            *   [X] Mock `readFile` to return valid mnemonic data (`Uint8Array`).
            *   [X] Simulate Import click, verify loading state, verify `pickFile` and `readFile` called, verify `mnemonic` state updated, verify success status displayed.
            *   [X] Add test for invalid mnemonic format (e.g., < 12 words).
            *   [X] Add test for platform hook returning `capabilityError`.
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Implement the `async handleImport` function:
            *   [X] Set `isActionLoading` to true, clear status message.
            *   [X] Perform `isAvailable` check.
            *   [X] Call `platformCapabilities.fileSystem.pickFile`. Handle null return.
            *   [X] Call `platformCapabilities.fileSystem.readFile`. Handle errors.
            *   [X] Convert result using `TextDecoder`, update `mnemonic` state via `setMnemonic`.
            *   [X] Add basic validation for mnemonic format.
            *   [X] Set success/error status message and variant via `setStatusMessage`/`setStatusVariant`.
            *   [X] Set `isActionLoading` to false in a `finally` block.
        *   [X] Pass `handleImport` to `FileActionButtons` component.
        *   [X] Implement rendering logic for `capabilityError` state.
    *   [ ] Verify all import tests pass (or update tests if needed).
    *   [ ] [COMMIT] Commit import functionality and tests with message "feat(UI): Implement mnemonic import functionality in WalletBackupDemoCard".

*   **[1.9] Implement Export Functionality in `WalletBackupDemoCard` [🚧]:** (Was 1.7)
    *   *Prerequisite: Step 1.8 completed.*
    *   [X] In `WalletBackupDemoCard.test.tsx`:
        *   [X] Add tests for the export workflow (mocking platform functions). *(Marking X as tests were written, but may need updates)*
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Implement the `async handleExport` function:
            *   [X] Set `isActionLoading` to true, clear status message.
            *   [X] Get current `mnemonic` from state. Handle empty case.
            *   [X] Perform `isAvailable` check.
            *   [X] Call `platformCapabilities.fileSystem.pickSaveFile`. Handle null return.
            *   [X] Convert mnemonic string to `Uint8Array` using `TextEncoder`.
            *   [X] Call `platformCapabilities.fileSystem.writeFile`. Handle errors.
            *   [X] Set success/error status message and variant.
            *   [X] Set `isActionLoading` to false in `finally` block.
        *   [X] Pass `handleExport` to `FileActionButtons` component.
    *   [ ] Verify all export tests pass (or update tests if needed).
    *   [ ] [COMMIT] Commit export functionality and tests with message "feat(UI): Implement mnemonic export functionality in WalletBackupDemoCard".

*   **[1.10] Manual Verification [🚧]:** (Was 1.8)
    *   *Prerequisite: Step 1.9 completed.*
    *   [X] Run the application in a web browser. Verify the component displays the "unavailable" state correctly.
    *   [X] Run the application in Tauri (`