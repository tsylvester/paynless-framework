# Platform Capability Abstraction Layer

**Owner:** Core Team
**Status:** Implemented (May 2024)
**Related Implementation Plan:** `docs/implementations/Current/desktop-crypto/20250502_Merged_Platform_Capabilities.md`

## Purpose

The Platform Capability Abstraction Layer provides a unified way for the shared frontend codebase (`apps/web/` and potentially future mobile apps) to interact with platform-specific features, such as filesystem access, notifications, or window management, without needing to know the underlying platform (Web, Tauri Desktop, React Native, etc.).

This allows developers to build features that leverage native capabilities when available (e.g., using the local filesystem in the Tauri desktop app) while ensuring the application degrades gracefully on platforms where those capabilities are absent (e.g., a standard web browser).

## Architecture

The layer consists of several key parts primarily located within the `packages/platform` workspace package:

1.  **Core Service (`packages/platform/src/index.ts`)**:
    *   Exports the main asynchronous function `getPlatformCapabilities(): Promise<PlatformCapabilities>`.
    *   Responsible for detecting the current runtime platform (`web`, `tauri`, etc.) and operating system (`windows`, `macos`, etc.).
    *   Dynamically imports the appropriate **Provider** module based on the detected platform.
    *   Assembles the final `PlatformCapabilities` object, incorporating the features exposed by the loaded provider.
    *   Memoizes (caches) the result after the first successful call to avoid redundant detection work.
    *   Exports `resetMemoizedCapabilities()` for testing purposes.
    *   Re-exports the `PlatformProvider`, `usePlatform` hook, and `platformEventEmitter`.

2.  **Capability Interfaces (`packages/types/src/platform.types.ts`)**:
    *   `PlatformCapabilities`: The main interface defining the overall structure. It includes the detected `platform` and `os`, and then properties for different capability *groups* (e.g., `fileSystem`, `notifications`).
    *   `FileSystemCapabilities`: An example interface defining methods for file system operations (`readFile`, `writeFile`, `pickFile`, `pickDirectory`, `pickSaveFile`). Includes `isAvailable: true`.
    *   `CapabilityUnavailable`: A simple interface (`{ isAvailable: false }`) used in union types within `PlatformCapabilities` to indicate when a capability group is *not* available on the current platform (e.g., `fileSystem: FileSystemCapabilities | CapabilityUnavailable`).
    *   `CapabilitiesContextValue`: Defines the shape of the value provided by the React context (`capabilities`, `isLoadingCapabilities`, `capabilityError`).

3.  **Providers (`packages/platform/src/*.ts`)**:
    *   Platform-specific modules responsible for implementing the capability interfaces.
    *   `web.ts`: Provider for standard web browsers. Currently implements `FileSystemCapabilities` as `isAvailable: false`.
    *   `tauri.ts`: Provider for the Tauri desktop environment. Implements `FileSystemCapabilities` by calling the relevant standard Tauri plugins (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`).
    *   *(Future providers for React Native or other platforms would be added here).*

4.  **React Context & Hook (`packages/platform/src/context.tsx`)**:
    *   `PlatformProvider`: A React component that should wrap the application (or relevant parts). On mount, it calls `getPlatformCapabilities()` and manages the loading, error, and resolved capability states. It also sets up platform-specific event listeners (like Tauri's `onDragDropEvent`).
    *   `usePlatform()`: A hook that components use to access the capability state (`capabilities`, `isLoadingCapabilities`, `capabilityError`). Throws an error if used outside a `PlatformProvider`.

5.  **Event Emitter (`packages/platform/src/events.ts`)**:
    *   Exports `platformEventEmitter`, a `mitt` instance.
    *   Used for decoupled communication between different parts of the platform layer or with consuming UI components.
    *   Currently used by `PlatformProvider` (`context.tsx`) to broadcast drag-and-drop lifecycle events (`file-drop`, `file-drag-hover`, `file-drag-cancel`) originating from the Tauri `onDragDropEvent` listener. Components like `DropZone` listen to these events.

## Usage Pattern in UI Components

To use the platform capabilities in a React component:

1.  **Ensure `PlatformProvider` is an ancestor:** Your component must be rendered within a tree wrapped by `<PlatformProvider>`. This is typically done near the root of the application (e.g., in `apps/web/src/App.tsx`).

2.  **Use the Hook:** Import and call the `usePlatform` hook:
    ```typescript
    import { usePlatform } from '@paynless/platform';

    function MyComponent() {
      const { capabilities, isLoadingCapabilities, capabilityError } = usePlatform();
      // ...
    }
    ```

3.  **Handle Loading State:** Check `isLoadingCapabilities` first to display a loading indicator (e.g., `Skeleton`) while capabilities are being determined. This prevents flicker or attempting to access `capabilities` before they are ready.
    ```typescript
    if (isLoadingCapabilities) {
      return <Skeleton className="h-20 w-full" />;
    }
    ```

4.  **Handle Error State:** Check `capabilityError` next to display an error message if the initial capability detection failed.
    ```typescript
    if (capabilityError) {
      return <Alert variant="destructive">Error: {capabilityError.message}</Alert>;
    }
    ```

5.  **Check Capability Availability:** Before attempting to render UI or call methods related to a specific capability group (e.g., `fileSystem`), check if the capability object exists and its `isAvailable` flag is true. Use optional chaining (`?.`) for safety.
    ```typescript
    const fileSystem = capabilities?.fileSystem;
    const isFileSystemAvailable = fileSystem?.isAvailable === true;

    // ... later in JSX ...

    {isFileSystemAvailable ? (
      <Button onClick={handleSave}>Save File</Button>
    ) : (
      <Alert>File saving requires the Desktop app.</Alert>
    )}
    ```

6.  **Call Capability Methods:** If a capability is available, you can call its methods. Remember that most capability methods (like file operations) are asynchronous.
    ```typescript
    const handleSave = async () => {
      // Check again inside handler for robustness
      if (!fileSystem || !isFileSystemAvailable) return; 
      
      setIsSaving(true); // Manage local action loading state
      try {
        const path = await fileSystem.pickSaveFile({});
        if (path) {
          const data = new TextEncoder().encode("My data");
          await fileSystem.writeFile(path, data);
          setStatus("File saved!");
        } else {
          setStatus("Save cancelled.");
        }
      } catch (error) {
        console.error("Save error:", error);
        setStatus(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsSaving(false);
      }
    };
    ```

7.  **Handle Action Loading/Errors:** Implement local state within your component to manage loading states (`isSaving`, `isLoading`) and display feedback/errors (`statusMessage`, `statusVariant`) for specific actions initiated by the user (like saving a file), separate from the initial `isLoadingCapabilities` state.

## Adding New Capabilities

1.  **Define Interface:** Add a new capability interface (e.g., `NotificationCapabilities`) in `packages/types/src/platform.types.ts` and export it.
2.  **Update `PlatformCapabilities`:** Add the new capability to the main `PlatformCapabilities` interface, using a union with `CapabilityUnavailable` (e.g., `readonly notifications: NotificationCapabilities | CapabilityUnavailable;`).
3.  **Implement Provider(s):**
    *   Update relevant providers (`web.ts`, `tauri.ts`, etc.) to implement the new interface.
    *   For unavailable platforms (`web.ts`), return `{ isAvailable: false }`.
    *   For available platforms (`tauri.ts`), implement the methods using the necessary native APIs or plugins.
4.  **Update Service Core (`index.ts`):** Modify `getPlatformCapabilities` to load/initialize the new capability from the provider and add it to the final `memoizedCapabilities` object (initializing as unavailable by default).
5.  **Update Context (`context.tsx`):** No changes usually needed unless the context needs to manage specific state related to the new capability beyond just exposing the capability object itself.
6.  **Update UI Components:** Use the hook (`usePlatform`), check `capabilities?.newCapability?.isAvailable`, and call methods as needed.

## Testing

Refer to `docs/tests.md`, specifically point #21 ("Multi-Platform Capability Abstraction & Testing"), for the detailed testing strategy, which includes:
*   Unit testing the service, context, and providers (mocking underlying APIs/platforms).
*   Unit testing UI components by mocking the `usePlatform` hook to simulate different capability states.
*   Platform-specific integration and E2E tests. 