# Workplan Structure

A workplan is an ordered set of nodes. Each node is the complete unit of work for **one source file**. This topic owns node anatomy, how the agent handles the workplan, and the correct/incorrect node constructions. [tdd-ordering](tdd-ordering.md) owns the RED→GREEN cycle and element order the node carries; this topic owns the container.

The node is this repo's unit of scope, so every rule below is an application of [scope](scope.md): the node is where a boundary is drawn, and the author drawing it decides what falls inside so the implementer never has to.

Cited by: construction view (the workplan author builds nodes) and, for handling rules, every turn. Governed by all Process topics.

## Node anatomy

- A top-level node addresses exactly **one source file** and its entire support system — its interface, interface test, mock, guard test, guard, tests, provides, and integration test, to the extent the work requires them. This is inviolate.
- One source file per node. You cannot add a second source file "for one small edit." `function1.ts` and `function2.ts` are different nodes.
- All changes to a source file and its support live in **that file's one node**. Do not split a single source file across multiple nodes, and do not create multiple sequential nodes that edit the same set of files.
- Files that have no types and no tests (e.g. a database migration) are the only ones exempt from the full support-file structure.

If you ever begin to write a second file path and name inside the node element of another file, YOU ARE WRONG! YOU ARE WRONG! STOP IMMEDIATELY! THIS IS NOT VALID! EVERY FILE IS ITS OWN ELEMENT IN THE NODE! YOU DO NOT NEST ADDITIONAL FILES INSIDE ANOTHER FILES' ELEMENT! Discovering you need to touch another file means YOU MUST EVALUATE IF THE ADDITIONAL FILE IS A VALID MEMBER OF THE NODE, AND EVALUATE WHAT THE DEPENDENCY ORDER IS FOR AUTHORING THE FILES! ***DO NOT CRAM MULTIPLE FILES INTO A SINGLE NODE ELEMENT!*** 

A node names **elements**, not the symbols inside them. That is not an omission to be corrected by longer nodes — the symbols are a fact on disk, read from the interface's export surface, and a node that tries to enumerate them dates the moment the interface changes. What the node owes is the boundary; what the standards owe is completeness within it (see [scope](scope.md)).

## Authoring gate

Before writing any element of a node, read every topic that element's row in the [routing matrix](index.md) names — in full. A node element written from memory of a topic's contents rather than from a current reading of it is the same defect the implementer's read gate prevents, one stage earlier. The author validates each element against its governing topics and against the [wrong-construction table](#node-constructions--wrong-vs-right) before the node reaches an implementer.

The implementer's remedy — comply with the topic and report the discrepancy — exists because defective nodes reach them despite this gate. It is a fallback, not the primary mechanism. The author catching the defect here costs one re-read; the implementer catching it costs a halt, a report, a round-trip, and a node revision.

## New packages vs. existing files

- A **new** package's node adheres to the entire node template — omit no element — so new work is born aligned to current standards.
- When editing an **existing** file or package, the node includes only the elements the work requires. Do not retrofit an existing file to the full template unless the user explicitly directs it — that would rework otherwise-functional components for no reason.

## Planning sections and conditional omission

Some node elements are **planning sections**, not files: intent and position (§1), dependencies and injection (§2), interaction semantics (§5, `interaction.spec`), construction (§9), directionality (§13), and completion criteria (§14). The node reasons through them; it does not create a file for them.

An element — file or planning section — is included whenever the work touches its concern, and omitted **only** when the work's nature removes that concern (for example, a minor edit to an existing, well-constructed file that changes no interaction pattern and touches nothing about construction). This is conditional, not discretionary: the context decides whether an element applies, never the author's preference or convenience. When in doubt, include it.

## The interaction spec is a branch contract

The implementation body is the one element no template can capture — its logic is the variable. The `interaction.spec` (§5) fills that gap: it specifies the body as a **branch contract** so the implementer assembles it rather than inventing it.

For each branch the function takes, the spec states:

- **Condition** — the input state or check that selects this branch.
- **Decision** — the guard or comparison applied (see [guards](guards.md)).
- **Dependency call** — which injected dependency is invoked, if any.
- **Outcome** — the exact success flavor returned, or the error propagated or raised (see [errors-and-returns](errors-and-returns.md)).

Every branch ends in a member of the return union; none falls through untyped. With the branch contract complete, the implementation is assembly — guard the payload on entry, then realize each branch exactly as specified. A branch contract stops at the contract; it is not pseudocode for the whole function body.

## What is never its own node

- **Types and interfaces are never independent nodes.** A type is only ever edited so a source file can consume it, so the type edit lives in the node for the first source file that requires it — together with that type's interface test, guards, and guard tests.
- **Guards and guard tests are never separated** from the interface that uses them; they are steps in the consuming source file's node.
- **A commit is never its own node.** The commit step is the last step of the last node in a completed set of work (see Handling → Commits).

A single node **may** edit several interfaces and guards to provide for its one implementation file. Many producers, one implementation, per node. Each such producer is its own element at its own nesting level in the fixed order — interface test before interface before mock before guard test before guard, all before the implementation they serve (see [tdd-ordering](tdd-ordering.md)). Two files in one element bullet, or a producer element placed after the implementation element it serves, are both malformed.

## Identity and ordering

- **Nodes are not numbered.** They use relational references to other files only. Relational references survive insertion and reordering; numbering is brittle and forces a ripple edit of every later node on any change.
- **Nothing else is numbered either.** The prohibition is not specific to nodes — it covers sprints, epics, phases, workstreams, milestones, and any other container an author might invent. Numbering a group is the same brittleness one level up: insert or reorder one item and every later ordinal must be rewritten. Address every grouping by its dependency role, never an ordinal — "Sprint 2" or "Phase 3" is numbering.
- A node is addressed by its deepest unique path segment.
- Intra-node and inter-node work is dependency-ordered, producers first. The order itself is owned by [tdd-ordering](tdd-ordering.md); the author confirms nodes sit in that order and moves a dependent node after its provider if not.

## Incrementing an existing workplan

- Preserve all existing detail when adding requirements. We increment and improve, not replace — unless the user explicitly changes an existing requirement.
- If a prior version of a node exists, copy its state and revise that state to match the new requirements.
- Console logs and fixes derived from test output are not documented in the workplan **unless** the output shows a requirement is misstated and must be corrected.

## The workplan states what is, never what it was

A node is an instruction to the implementer, not a change log, and not a commentary on the author's decisions. It contains only what the implementer acts on — the element, its file, and its requirements. Everything else is excluded: version-history markers (`AMENDED` / `CORRECTED` / `REVISED` / `RATIFIED` / `UPDATED` / `RESOLVED`), dated amendments, "was X, now Y" narration, and placement rationale (`RIDES WITH` / `RIDES HERE` / `included because` / `lands here since` or any other explanation of why the author placed an element in this node rather than another). The node states what to build; it does not explain why it is here.

When a requirement changes, revise the node **in place** so it reads as the single current instruction — the superseded wording is deleted, not annotated. What the author once thought and later corrected is irrelevant to the implementer; only what the implementer must do now belongs in the node. Tests follow the same rule (see [tests](tests.md)).

## Handling the workplan

- Do not edit the workplan, or any node's status (checkboxes, badges), without explicit instruction. When instructed, change only the specified portion, exactly as described.
- Do not emit full workplan nodes in chat unless explicitly told to for that turn. The Read → Analyze → Explain → Propose cycle and EO&D reporting do **not** by themselves authorize emitting node content (see [output](output.md), [loop](loop.md)).
- Document every edit within the workplan. If required edits are missing from the plan, explain the discovery, propose the new node, and halt — do not improvise (see [discovery-halt](discovery-halt.md)).
- Obey the user first, then the Instructions topics, then the workplan. Never hide behind the workplan to ignore a direct user correction (see [precedence](precedence.md)). If the user tells you to work without updating the workplan, obey without complaint.
- **Commits:** a commit step belongs in the last node of a completed set of work — generally once a producer → implementation → consumer chain can be integration-tested. The integration test is an obligate inclusion in the last node of that chain; never strand integration tests or commits in a node of their own. The agent never runs the commit itself (see [environment](environment.md)).

## The To-Do list — debt the workplan has not scheduled

A workplan carries a **To-Do list** alongside its nodes. It holds work that has been *found* but deliberately not *scheduled*: non-compliance an agent met while doing something else, and correctly did not stop for.

Its only supplier is the first of the three locate-before-create outcomes (see [tdd-ordering](tdd-ordering.md#three-outcomes-and-only-one-of-them-is-create-it)) — a resource found and usable, but non-compliant in ways that do not block the task. A builder under the wrong name, a mock in the wrong folder, a guard owned by an interface that should not own it. The work proceeds using what exists, and the defect is recorded rather than fixed in passing, because fixing legacy opportunistically in the middle of another task is how one file's work becomes four.

### It is not a way to defer a halt

**If a topic tells you to stop, you stop.** An untyped value ([types](types.md)), a missing producer, a function that needs refactoring to proceed ([dependency-injection](dependency-injection.md)), a guard that does not check what you need ([guards](guards.md)) — every one of these is a halt, and none becomes a To-Do entry because writing it down felt more productive than stopping. The To-Do list receives only what no topic required you to stop for.

An entry that would have been a halt is a halt that was skipped, and the file it was skipped in is already wrong.

### An entry is not a node

Entries are prose, not node structure. They are not dependency-ordered, carry no elements, and are never numbered ([Identity and ordering](#identity-and-ordering) applies here as everywhere). Each states four things:

- **What was found** — the actual symbol or file, not a category.
- **Where** — the real path.
- **What resolving it would take** — the shape of the work, not a plan for it.

When an entry is scheduled, it becomes a node and is authored through the ordinary path — by the workplan author, in the template, dependency-ordered. Nothing is implemented straight from a To-Do entry; the entry is a record that work exists, never an instruction to do it.

### The agent reports entries; it does not write them

Recording debt is not an exemption from anything. The agent does not edit the workplan without instruction (above), does not write to files it was not directed to write ([output](output.md)), and edits one file per turn ([loop](loop.md)) — and the file it is editing is not the workplan.

So the agent **reports the entry in its final response**, in the four-part form above, ready to be placed. Recording it is the user's action, exactly as with a proposed node. An agent that appends to the workplan mid-task has edited a second file to avoid mentioning something.

## Canaries

The node template carries three canaries. An actual node **omits** two teaching-only elements the template shows — the `## (number) (type)` section headers and the `Conforms to:` lines — and **preserves the template's line breaks**. The `Conforms to:` citations are authoring guidance: the author reads each element's topics and obeys them while writing that element, but never prints the citation into the node, where it is only noise. Violating any of the three proves the structure is not being followed — if a canary trips, the node is discarded. (The canary mechanism itself is owned by [traceability](traceability.md); these are its specific applications to the node template.)

## Resolve decisions in the node, do not defer them

The author turns ambiguity into named, reusable components so the implementer instantiates rather than invents. Whenever the answer is knowable at authoring time, the node states it outright — exact paths to touch or import from, exact existing symbols to reuse (located, not assumed), the exact owning interface of every new symbol, and a copy-worthy pattern to follow (a topic's template, or a named prior node).

Resolution follows three tiers, in order:

1. **Name it.** If the author can determine the path, symbol, guard, or import, the node names it. This is the default and covers most cases.
2. **Search it.** If the node does not name it, the implementer uses the topic's deterministic search procedure — never a guess (the predicate search in [guards](guards.md), locate-before-create in [tdd-ordering](tdd-ordering.md)).
3. **Halt.** If neither the node nor a search resolves it, that is a discovery: report and halt (see [discovery-halt](discovery-halt.md)).

Guessing is never a tier. A node that tells the implementer to "infer," "determine whether," or "figure out" which symbol to use has deferred an authoring decision — the "check if / validate that" defect below. The author resolves it now.

## Node constructions — wrong vs. right

The author does the thinking so the implementer does not. Every node must be grounded, complete, and self-contained enough that the implementer can act from the node and the referenced file alone.

| Wrong construction | Correct construction |
|---|---|
| One node for the interface, one for the guards, one for the test+source | Interface tests, interfaces, guard tests, and guards go in the node for the **first source file** that consumes them |
| `function1`, then `function1-test` | The test is written **before** the implementation |
| Moving a test after the implementation it covers | The test always precedes its implementation — RED before green; the order is immutable ([tdd-ordering](tdd-ordering.md)) |
| Lumping a test and its implementation into one step | Each element is its own step in the fixed order; a test and its implementation are never merged ([tdd-ordering](tdd-ordering.md)) |
| `func1-test`, `func2-test`, `func1`, `func2` | Each source file gets **its own node** fully describing its changes and support files |
| An interface or guard edit orphaned in its own node | The type edit goes in the node for the implementation file that requires it, along with its interface test, guards, and guard tests |
| Cramming several implementation files into one node | One node hosts a single implementation file (but may edit several interfaces/guards for it) |
| A commit step at the end of every node | A commit step only where a defined set of work completes and the whole call stack is updated |
| A separate node for integration tests or commits | The integration test and commit are steps in the **last node** of the chain they prove |
| A node step that says "grep for", "check if", "validate that", "determine whether" | The author greps, checks, validates, and determines **now**, before writing the node. The implementer implements; it does not verify the work is complete |
| A node step that says "no change required" | Omit it. No-op inclusions are noise |
| A node carrying `AMENDED:` / `REVISED:` / "was X, now Y" history | State the current instruction as fact; delete superseded wording rather than annotate it |
| Numbering sprints, epics, phases, or workstreams | Everything is addressed relationally by dependency — no ordinals at any level, not just on nodes |
| Two files addressed in a single element bullet | Each file is its own element at its own nesting level in the fixed order |
| A producer element (interface, guard, mock change) placed after the implementation element that consumes it | Producers precede consumers in the immutable element order; all interface/guard/mock elements precede the implementation |
| Placement rationale in the node (`RIDES WITH`, `RIDES HERE`, `included because`) | The node contains only the instruction the implementer acts on; the author's placement reasoning is omitted |
| An integration test element that tests a single function with no chain across a boundary | An integration test exercises a chain of real functions across an approved boundary; a single function tested alone is a unit test |
| An interface test element advising `Parameters<MyFunction>[n]` as proof of an exported parameter-object symbol | The interface test proves each exported symbol by name; `Parameters<>[n]` is a derived projection and is never a substitute (see [interfaceTest](interfaceTest.md)) |
| Author-reasoning commentary about why something is in this node or what state the work is in | State the current requirement as fact; the node is not a commentary on the author's process |

The table above is illustrative, not exhaustive. Every element must also conform to every topic its row in the [routing matrix](index.md) names. A construction absent from this table is not thereby permitted — it is permitted only if no governing topic prohibits it.

## Precedence

This topic outranks the workplan it describes. A node that numbers its entries, hosts two source files, orphans a type or guard edit, strands a commit or integration test, or pushes verification onto the implementer is malformed — the author corrects it before it reaches an implementer.

## Node template

The groups are numbered `## N. Title` for teaching only. An **actual node omits every `## (number) (type)` header and every `Conforms to:` line**, and preserves the bullet line breaks (the three canaries above). The `Conforms to:` citations tell the author which topics govern each element — obey them while writing, but do not copy them into the node. Supply only what is specific to this file's work, and never restate a topic's rules in a node.

```
  ## 1. Intent & Position
  * `[ ]`   `objective`
    * `[ ]`   Define the *problem being solved* (not the solution)
    * `[ ]`   Separate functional goals (what must happen) from non-functional constraints
    * `[ ]`   Each goal is atomic and testable
  * `[ ]`   `role`
    * `[ ]`   Declare the node's role (domain/app/port/adapter/infra) and why it is appropriate
    * `[ ]`   Identify what this node must NOT do (out-of-scope responsibilities)
  * `[ ]`   `module`
    * Conforms to: boundaries
    * `[ ]`   Define the bounded context; what concepts/data belong inside vs outside

  ## 2. Dependencies & Injection
  * Conforms to: dependency-injection, boundaries
  * `[ ]`   `deps`
    * `[ ]`   For each dependency: provider, layer, direction (why allowed), purpose
    * `[ ]`   Confirm no reverse dependencies and no lateral layer violations
  * `[ ]`   `context_slice`
    * `[ ]`   The minimal interface required from each dependency; injection shape (pure interface)

  ## 3. Contract Definition (Truth)
  * Conforms to: tests#interface, composition, types, errors-and-returns
  * `[ ]`   `[function].interface.test.ts`
    * `[ ]`   Prove this function's contract for this work: type membership, return-union arms and flavors, invariants

  ## 4. Structural Boundary (Shape)
  * Conforms to: composition, types, errors-and-returns, dependency-injection
  * `[ ]`   `[function].interface.ts`
    * `[ ]`   Declare this function's signature: deps, params, payload, and the Success | Error return union

  ## 5. Interaction Semantics (Behavioral Structure)
  * Conforms to: composition, errors-and-returns, guards
  * `[ ]`   `[function].interaction.spec`
    * `[ ]`   Declare the branch contract — per branch: condition, decision, dependency call, and the exact return-union outcome; plus side effects and ordering. Declarative, no code

  ## 6. Simulation
  * Conforms to: mocks
  * `[ ]`   `[function].mock.ts`
    * `[ ]`   Provide the builders, invalidators, and function mocks this interface owns (before the guard test consumes them)

  ## 7. Enforcement (Runtime Boundary)
  * Conforms to: tests#guard, guards
  * `[ ]`   `[function].guard.test.ts`
    * `[ ]`   Prove each owned guard: no false positives, no false negatives (the case checklist)
  * `[ ]`   `[function].guard.ts`
    * `[ ]`   Implement each owned guard

  ## 8. Behavioral Verification
  * Conforms to: tests#unit, errors-and-returns, composition
  * `[ ]`   `[function].test.ts`
    * `[ ]`   Validate transformations and branching against requirements and the interaction spec
    * `[ ]`   Do NOT re-test type shape or guard correctness
  * `[ ]`   `[function].someOther.test.ts`
    * `[ ]`   If the function has multiple test files, include every one that must be updated

  ## 9. Construction
  * Conforms to: dependency-injection, composition
  * `[ ]`   `construction`
    * `[ ]`   Factory/constructor entrypoints; required deps at creation; no partially constructed instances

  ## 10. Implementation
  * Conforms to: composition, dependency-injection, types, errors-and-returns, guards, logging
  * `[ ]`   `[function].ts`
    * `[ ]`   Implement the behavior from requirements and the interaction spec
    * `[ ]`   Introduce no undeclared dependencies; bypass no guards or contracts

  ## 11. External Boundary
  * Conforms to: boundaries
  * `[ ]`   `[function].provides.ts`
    * `[ ]`   Export the public surface: interfaces, guards, functions, mocks

  ## 12. Edge Validation
  * Conforms to: tests#integration
  * `[ ]`   `[function].integration.test.ts`
    * `[ ]`   Validate provider → function → consumer across the approved boundary; mock only at the outer edge

  ## 13. Directionality (Graph Constraint)
  * Conforms to: boundaries
  * `[ ]`   `directionality`
    * `[ ]`   Confirm deps inward, provides outward, no unjustified cycles

  ## 14. Completion Criteria
  * Conforms to: tdd-ordering
  * `[ ]`   `requirements`
    * `[ ]`   Binary, observable, testable acceptance criteria, each mapped to a test

  ## 15. Versioning — only at the end of a complete set of work, not on every node
  * Conforms to: workplan-structure
  * `[ ]`   **Commit** `[type] [scope] [summary]`
    * `[ ]`   List structural, behavioral, and contract changes
```

Element → topic citations, clickable: `module` → [boundaries](boundaries.md); `deps` → [dependency-injection](dependency-injection.md); `interface.test` → [tests](tests.md#interface); `interface` → [composition](composition.md) + [types](types.md) + [errors-and-returns](errors-and-returns.md); `mock` → [mocks](mocks.md); `guard.test` / `guard` → [tests](tests.md#guard) + [guards](guards.md); `test` → [tests](tests.md#unit); `implementation` → [composition](composition.md) + [dependency-injection](dependency-injection.md) + [types](types.md) + [errors-and-returns](errors-and-returns.md) + [guards](guards.md) + [logging](logging.md); `provides` → [boundaries](boundaries.md); `integration.test` → [tests](tests.md#integration).

## Legend

You must use the EXACT format of the node structure. Do not modify, adapt, or "improve" the bullets, square braces, ticks, nesting, or node structuring — they are mandatory and unalterable.

```
*   `[ ]` [path]/[workspace] Unstarted work step in a node. Each node is addressed by its deepest unique segment.
    *   `[ ]` [subfolder]/`filename`. Elements nest as shown; subnodes show the path/file to address that element.
        *   `[ ]` [subfolder]/[subfolder]/`filename` Nesting can be as deep as logically required.
*   `[✅]` Represents a completed step at any depth.
```

## Component type labels

`[DB]` migration · `[RLS]` row-level security · `[BE]` backend logic · `[API]` API client library · `[STORE]` state management · `[UI]` frontend component · `[CLI]` · `[IDE]` · `[TEST-UNIT]` · `[TEST-INT]` · `[TEST-E2E]` · `[DOCS]` · `[REFACTOR]` · `[PROMPT]` · `[CONFIG]` · `[COMMIT]` · `[DEPLOY]`.

