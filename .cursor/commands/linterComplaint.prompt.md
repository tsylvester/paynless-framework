The linter is complaining about a file. Read → Analyze → Explain → Propose → Halt (`docs/agents/loop.md`) — read-only, do not edit any file.

Diagnose per `docs/agents/linting-proof.md`: determine whether each error is in-file or out-of-file, and whether it is a genuine defect or the expected RED proof of a test-first step that has no implementation yet. Classify **every** error — a diagnosis that covers some and summarises the rest is not a diagnosis. Never silence a valid error.

**Name the successor.** A fix is applied in a later, separately instructed step, so a diagnosis that does not say where it goes dead-ends. Close every error with its disposition:

- **Expected RED** — no successor. The error is the deliverable of a test-first step (`docs/agents/linting-proof.md`), and the correct action is none. Say so plainly rather than proposing a fix nobody should apply.
- **A genuine defect, in this file** — the command owning this file's element: `interface`, `interfaceTest`, `mock`, `guard`, `guardTest`, `unitTest`, `implement`, `provide`, or `integrate`. Name which, and carry the diagnosis forward: the error verbatim, the line, and what must change. It is an additional requirement against the node that command is already working, never a replacement for it. If no open node covers this file, the fix is a discovery rather than a lint fix — report it as one (`docs/agents/discovery-halt.md`).
- **A genuine defect, out of this file** — not a fix at all. Fixing it is a multi-file discovery: report the impact and the workplan insert it needs (`docs/agents/discovery-halt.md`, `docs/agents/linting-proof.md`).

Do not edit any file. Explain and halt.

Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.