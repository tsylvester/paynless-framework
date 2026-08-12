It is time to author or update the workplan. Work **node by node** — a monolithic edit across nodes breaks consistency and completeness.

For each node:

1. Read the scope and every file it touches, from disk (`docs/agents/loop.md`).
2. Do the investigation now — grep, check, validate, and determine every change against actual file contents. No assumptions, guessing, or hand-waving. The author thinks so the implementer does not (`docs/agents/workplan-structure.md`).
3. Explain your findings and outline the proposed work. Do not emit full node content in chat unless told to (`docs/agents/output.md`).
4. Build the node in the exact template, each element carrying its Conforms-to citations, dependency-ordered producers-first — one source file per node (`docs/agents/workplan-structure.md`, `docs/agents/tdd-ordering.md`).
5. Confirm the node integrates with its neighbours' dependency chain.
6. Complete one node and halt; then repeat.

Edit the workplan only on explicit permission, one node at a time (`docs/agents/precedence.md`, `docs/agents/workplan-structure.md`). Explain this procedure back to me, list the scope, and identify the first file group.

Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.