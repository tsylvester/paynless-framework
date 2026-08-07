Write the provides file for the current node's module, exactly as the node describes.

Export the public surface — interfaces, guards, functions, mocks — so a consumer imports
only from here and never reaches into an internal file.

**Re-export whole files, never individual symbols.** One `export * from "./file.ts"` per
internal file, as `docs/agents/boundaries.md` shows. If it is exported from the internal
file, it is provided. Naming symbols one by one is the defect here, not the diligence: it
makes this file need an edit every time an internal file gains an export, and the edit that
gets forgotten is a symbol a consumer cannot reach. Written by file, this element is written
once and stays correct as the internals change.

**The checklist is the module's internal files, not its symbols.** Enumerate the files —
the implementation, the interface, the guard, the mock, and any other internal file with a
public surface — and confirm one `export *` for each. Where the node names fewer files than
the module holds, it has not excluded the rest; silence is not exclusion
(`docs/agents/scope.md`). A missing line here is an entire file's worth of symbols
unreachable, which is why the coverage question is asked at all.

**Deliberate omission is a decision, not a default.** A module may choose to keep an
internal file internal — that is what a boundary is for. But an omitted file is a choice to
state, not a gap to leave: say which file you left out and why. Silence reads identically to
having missed it.

Close with the enumeration: every internal file, and its `export *` line or the reason it
has none (`docs/agents/scope.md`, the coverage canary). The canary counts files here,
never symbols — a per-symbol list would satisfy it while reintroducing exactly the churn
the star export exists to prevent.

Conforms to: `docs/agents/boundaries.md`.

Do only the provides file. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.
