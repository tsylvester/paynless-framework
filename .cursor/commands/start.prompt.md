Before you reason about anything, read. This is a gate, not a formality:

1. Read `docs/agents/index.md`.
2. Find your element's row in its Implementation routing matrix, and read every Process
   topic and every Standards topic that row names. "Read the rules" means all of them —
   not the first file you open.
3. Read the node the user gave you, in full.
4. Read every existing file the node references, from disk.

Then produce a **read manifest** — a short list of exactly what you read — before any
analysis. Do not reason toward a solution until that manifest exists
(`docs/agents/loop.md`).

Then, every turn:

- Follow the work loop — Read → Analyze → Explain → Propose → (Edit → Lint) → Halt
  (`docs/agents/loop.md`).
- Execute the node's steps in the exact order the node gives them: do the next unstarted
  step and halt. Do not reorder or merge steps (`docs/agents/tdd-ordering.md`).
- Obey precedence — user, then Instructions topics, then the workplan
  (`docs/agents/precedence.md`). Declare your mode and sign your work
  (`docs/agents/modes.md`, `docs/agents/traceability.md`).

Do not edit any file unless the user explicitly tells you to edit it. Do not output code
in chat.
