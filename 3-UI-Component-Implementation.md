### [✅] STEP-3.3.4: Richer Attribution and Message Interaction
*   **Commit:** `feat(UI): Create ChatMessageBubble with Card, AttributionDisplay, and edit features w/ tests` (for 3.3.4.B)
*   **Commit for 3.3.4.C & overall step completion:** `feat(AI): Integrate ChatMessageBubble into AiChatbox, add tests, and fix promptId typing`

*   [✅] **STEP-3.3.4.A: `AttributionDisplay` Component**
    *   [✅] A.1. Define props: `message: ChatMessage`, `timestampPosition: 'top' | 'bottom'`, `showSourceIcon: boolean`, `className?: string`.
    *   [✅] A.2. Create `apps/web/src/components/ai/AttributionDisplay.tsx`.
    *   [✅] A.3. Implement basic structure: Display formatted timestamp, model name (if assistant), user identifier (if user).
    *   [✅] A.4. Create `apps/web/src/components/ai/AttributionDisplay.test.tsx`.
    *   [✅] A.5. Write initial tests:
        *   [✅] Renders timestamp correctly for user and assistant.
        *   [✅] Renders model name for assistant, not for user.
        *   [✅] Renders user identifier (email/anonymous) for user, not for assistant.
        *   [✅] Handles `timestampPosition` prop correctly (visual check or more complex DOM structure test if necessary).
        *   [✅] `showSourceIcon` prop (placeholder for now, visual check).
    *   [✅] A.6. Implement component logic to pass tests.
    *   [✅] A.7. Refactor and style.
    *   [✅] A.8. Final test run.

*   [✅] **STEP-3.3.4.B: Create/Refactor `ChatMessageBubble` Component**
    *   [✅] B.1. Define props: `message: ChatMessage`, `onEditClick?: (messageId: string, currentContent: string) => void`.
    *   [✅] B.2. Create `apps/web/src/components/ai/ChatMessageBubble.tsx`.
    *   [✅] B.3. Create `apps/web/src/components/ai/ChatMessageBubble.test.tsx`.
    *   [✅] B.4. Write test cases (`it.todo`) in `ChatMessageBubble.test.tsx`:
        *   [✅] Renders message content.
        *   [✅] Integrates and renders `AttributionDisplay` with correct props.
        *   [✅] Displays a `Card` or similar styled container.
        *   [✅] Applies different styling/layout for 'user' vs 'assistant' roles.
        *   [✅] Edit button:
            *   [✅] Visible for user messages if `onEditClick` is provided.
            *   [✅] Not visible for assistant messages.
            *   [✅] Not visible if `onEditClick` is not provided.
            *   [✅] Calls `onEditClick` with `message.id` and `message.content` when clicked.
    *   [✅] B.5. Implement basic component structure in `ChatMessageBubble.tsx`:
        *   [✅] Use `Card` from `shadcn/ui`.
        *   [✅] Integrate `AttributionDisplay`.
        *   [✅] Render `message.content` (basic for now, markdown later).
        *   [✅] Placeholder "Edit" button.
        *   [✅] Basic role-based styling.
    *   [✅] B.6. Implement tests one by one (RED -> GREEN).
        *   [✅] Test content rendering and `AttributionDisplay` integration.
        *   [✅] Test `Card` presence and role-based styling.
        *   [✅] Test Edit button visibility and `onEditClick` callback.
    *   [✅] B.7. Refactor `ChatMessageBubble.tsx` to pass all tests and refine styling.
    *   [✅] B.8. Final test run for `ChatMessageBubble.test.tsx`.

*   [✅] **STEP-3.3.4.C: Integrate `ChatMessageBubble` into Message Display Area (e.g., `AiChatbox.tsx`)**
    *   [✅] C.1. Examine `AiChatbox.tsx` to understand how messages are currently rendered and identify where `ChatMessageBubble` will be integrated.
    *   [✅] C.2. Identify if `AiChatbox.test.tsx` exists. (It did not, created).
    *   [✅] C.3. Define test cases for `AiChatbox.test.tsx`, focusing on the integration of `ChatMessageBubble` and the passing of `message` and `onEditMessageRequest` props. Also include existing core functionality tests.
    *   [✅] C.4. Create/Update `AiChatbox.test.tsx`: Add mocks for `ChatMessageBubble`, `useAiStore`, and necessary helper data/functions. Implement `it.todo` blocks for defined test cases.
    *   [✅] C.5. Modify `AiChatbox.tsx`: Import `ChatMessageBubble`. Add `onEditMessageRequest` to `AiChatboxProps`. Replace existing message rendering logic with `ChatMessageBubble`, passing the `message` object and conditionally passing `onEditMessageRequest` (as `onEditClick`). Handle any necessary state/prop drilling. Remove direct markdown/syntax highlighting. Update `promptId` handling to allow `null` and pass to store.
    *   [✅] C.6. Implement and run tests in `AiChatbox.test.tsx`. Iterate on component and test logic until all tests pass. (12 tests implemented and passing).
    *   [✅] C.7. Consider implications for auto-scrolling and ensure it still functions correctly with `ChatMessageBubble`. (Auto-scroll logic reviewed and simplified). 