# Implementation Plan: Markdown Rendering for AI Chat Responses

**Date:** 2025-04-21

**Goal:** Render Markdown content from AI assistant messages correctly and securely in the chat interface, maintaining a stable application state throughout the process.

**Chosen Libraries:**

*   `react-markdown`: Renders Markdown to React components.
*   `remark-gfm`: Plugin for `react-markdown` to support GitHub Flavored Markdown.
*   `rehype-sanitize`: Plugin for `react-markdown` to sanitize HTML output (Crucial for security!).
*   `react-syntax-highlighter`: Renders code blocks with syntax highlighting.

---

**Checklist:**

**Step 1: Install Dependencies**

*   [✅] **Implement:** Open your frontend project's terminal and run:
    ```bash
    pnpm add react-markdown remark-gfm rehype-sanitize react-syntax-highlighter
    ```
*   [✅] **Test:** Verify that the packages are listed in your `package.json` and the installation completed without errors. Check if `node_modules` reflects the new additions. Look for the `pnpm-lock.yaml` file updates.
*   [✅] **Build:** Run your frontend build command (likely `pnpm run build`). Ensure the build completes successfully with the new dependencies.
*   [✅] **Commit:** Commit the changes to `package.json` and `pnpm-lock.yaml`.
    *   *Commit Message Idea:* `feat(chat): install markdown rendering dependencies`

**Step 2: Basic Markdown Rendering in Chat Message Component**

*   [✅] **Implement:**
    *   Locate the React component responsible for rendering an individual chat message's content (e.g., `ChatMessage.tsx` or similar within `AiChatbox.tsx`).
    *   Import `ReactMarkdown` from `react-markdown` and `remarkGfm` from `remark-gfm`.
    *   Replace the part that directly renders the message content (e.g., `{message.content}`) with the `ReactMarkdown` component. Pass the message content as its child and enable the GFM plugin.
        ```jsx
        import ReactMarkdown from 'react-markdown';
        import remarkGfm from 'remark-gfm';
        // ... other imports

        // Inside your component where message.content is displayed:
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>
        ```
*   [✅] **Test:**
    *   Run the application locally (likely `pnpm run dev`).
    *   Send messages to an AI that is known to respond with basic Markdown (e.g., bold text `**bold**`, italics `*italic*`, lists `- item`, links `[link](url)`).
    *   Verify visually that the formatting is applied correctly in the chat interface instead of showing raw Markdown characters. Check for regressions in message display.
*   [✅] **Build:** Run `pnpm run build`. Ensure it completes successfully.
*   [✅] **Commit:** Commit the changes to the chat message component.
    *   *Commit Message Idea:* `feat(chat): implement basic markdown rendering for messages`

**Step 3: Add Syntax Highlighting for Code Blocks**

*   [✅] **Implement:**
    *   Import `Prism as SyntaxHighlighter` (or `Light as SyntaxHighlighter` for smaller bundles) from `react-syntax-highlighter`.
    *   Import a desired style, e.g., `import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism';` (adjust path based on your setup - `esm` or `cjs`).
    *   Configure `ReactMarkdown` to use `SyntaxHighlighter` for `code` elements via the `components` prop.
        ```jsx
        import ReactMarkdown from 'react-markdown';
        import remarkGfm from 'remark-gfm';
        import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
        import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism'; // Adjust path as needed

        // ... inside your component

        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code(props) {
              const {children, className, node, ...rest} = props
              const match = /language-(\w+)/.exec(className || '')
              return match ? (
                <SyntaxHighlighter
                  {...rest}
                  PreTag="div"
                  children={String(children).replace(/\n$/, '')}
                  language={match[1]}
                  style={okaidia} // Choose your style
                />
              ) : (
                <code {...rest} className={className}>
                  {children}
                </code>
              )
            }
          }}
        >
          {message.content}
        </ReactMarkdown>
        ```
*   [✅] **Test:**
    *   Run the application locally (`pnpm run dev`).
    *   Send messages to an AI that generates responses containing fenced code blocks (e.g., ```javascript\nconsole.log('hello');\n```). Test with different language identifiers if possible (e.g., `python`, `json`). Also test code blocks without a language specified.
    *   Verify that code blocks with a language are rendered with syntax highlighting using the chosen style (`okaidia` in the example). Verify that code blocks without a language are rendered as plain code.
*   [✅] **Build:** Run `pnpm run build`. Ensure it completes successfully.
*   [✅] **Commit:** Commit the changes.
    *   *Commit Message Idea:* `feat(chat): add syntax highlighting to markdown code blocks`

**Step 4: Ensure HTML Sanitization (Security)**

*   [✅] **Implement:**
    *   Import `rehypeSanitize` from `rehype-sanitize`.
    *   Add it to the `rehypePlugins` prop of the `ReactMarkdown` component. The default configuration is generally quite safe.
        ```jsx
        import rehypeSanitize from 'rehype-sanitize';
        // ... other imports including ReactMarkdown, remarkGfm, SyntaxHighlighter ...

        // Update the ReactMarkdown component:
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]} // Add this line
          components={{ /* ... syntax highlighting config from Step 3 ... */ }}
        >
          {message.content}
        </ReactMarkdown>
        ```
*   [✅] **Test:**
    *   Run the application locally (`pnpm run dev`).
    *   **Crucially:** Attempt to make the AI (or manually mock a response) return Markdown containing potentially harmful HTML/JS, such as:
        *   `<script>alert('XSS Attack!');</script>`
        *   `<img src="invalid-image" onerror="alert('XSS via onerror');">`
        *   `<a href="javascript:alert('XSS via href')">Click me</a>`
        *   `<iframe>...</iframe>`
    *   Verify that the potentially harmful tags and attributes are stripped out or neutralized and that **no** alert boxes or unexpected JavaScript executes. Inspect the rendered HTML using browser developer tools to confirm tags like `<script>` are gone.
    *   **Verify Raw Data (Optional but Recommended):** Check the raw message content stored in your database to ensure the malicious code was received, confirming that the *frontend* sanitization is solely responsible for preventing execution.
*   [✅] **Build:** Run `pnpm run build`. Ensure it completes successfully.
*   [✅] **Commit:** Commit the changes.
    *   *Commit Message Idea:* `feat(chat): ensure markdown HTML output is sanitized`

**Step 5: Basic Styling for Markdown Elements**

*   [✅] **Implement:**
    *   Add CSS rules to your project's stylesheet(s) (global CSS, CSS Modules, or styled-components) to style the HTML elements generated by `ReactMarkdown`. Target elements like `h1`-`h6`, `p`, `ul`, `ol`, `li`, `blockquote`, `pre`, `code` (inline), `table`, `th`, `td`, `a`.
    *   Focus on basic readability: margins, padding, font sizes, link colors, basic table borders, background for code blocks. Ensure the styling fits the overall application theme.
        ```css
        /* Example CSS (adjust selectors based on your setup) */
        .chat-message-content p { margin-bottom: 0.5em; }
        .chat-message-content h1 { font-size: 1.5em; margin-top: 1em; margin-bottom: 0.5em; }
        /* ... etc for other elements ... */
        .chat-message-content pre { background-color: #f0f0f0; padding: 1em; border-radius: 4px; overflow-x: auto; }
        .chat-message-content blockquote { border-left: 4px solid #ccc; padding-left: 1em; margin-left: 0; color: #555; }
        .chat-message-content table { border-collapse: collapse; margin-bottom: 1em; width: auto; }
        .chat-message-content th, .chat-message-content td { border: 1px solid #ddd; padding: 0.5em; }
        .chat-message-content th { background-color: #f7f7f7; }
        ```
*   [✅] **Test:**
    *   Run the application locally (`pnpm run dev`).
    *   Trigger AI responses containing a variety of Markdown elements (headers, lists, quotes, tables, links, code).
    *   Verify that the elements are styled reasonably and consistently with the rest of the application UI. Check readability and layout.
*   [✅] **Build:** Run `pnpm run build`. Ensure it completes successfully.
*   [✅] **Commit:** Commit the styling changes.
    *   *Commit Message Idea:* `style(chat): add basic styling for rendered markdown elements`

**Step 6: Final Review and Testing**

*   [✅] **Implement:** Review all the code changes made in the previous steps. Remove any temporary `console.log` statements or test code. Ensure imports are correct.
*   [ ] **Test:** Perform a final round of integrated testing:
    *   Send various messages and verify all Markdown features (basic formatting, GFM elements like tables, code blocks with/without language, links) render correctly and are styled.
    *   Re-test sanitization with malicious input examples.
    *   Test edge cases (e.g., very long messages, messages with mixed Markdown and plain text).
    *   Test with responses from *different* AI providers if applicable, as their Markdown habits might vary slightly.
*   [ ] **Build:** Run `pnpm run build` one last time.
*   [ ] **Commit:** Commit any final cleanup or adjustments.
    *   *Commit Message Idea:* `chore(chat): final review and cleanup for markdown rendering` 