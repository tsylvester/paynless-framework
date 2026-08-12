Write the guards for the current node's interface, exactly as the node describes.

One guard per owned type. For an imported-typed property, call the imported guard — never inline or re-author it. If a needed guard is missing, run the search and its three outcomes as `docs/agents/guards.md` defines them; do not improvise a search here.

**The interface's export surface is the checklist, not the node's bullets.** Enumerate every type the interface exports before writing, deps included. Where the node names fewer than the interface exports, it has not excluded the rest; silence is not exclusion (`docs/agents/scope.md`).

**Every owned type gets a guard — there is no "not needed" disposition.** You do not classify a type as worth guarding or not; that judgment is denied to the implementer (`docs/agents/guards.md`). What varies is the guard's **body**, not whether it exists: a data type checks presence, invariants, ranges, enum membership, cross-field rules, and the type of every property; a deps or behavior type checks presence of method only. Choosing the shallow body for a data type is an omission wearing a guard's name.

Close with the enumeration: every type the interface exports, and the guard written for it. A guard file covering fewer owned types than the interface exports is incomplete (`docs/agents/scope.md`, the coverage canary).

Conforms to: `docs/agents/guards.md`, `docs/agents/tdd-ordering.md`.

Do only the guards. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.

