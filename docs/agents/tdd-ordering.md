# TDD & Dependency Ordering

Work proceeds test-first, one file at a time, in bottom-up dependency order. This
topic owns the cycle and the order; [workplan-structure](workplan-structure.md)
owns the node container that carries them.

Cited by: construction view (the workplan author orders elements within a node and
nodes across a scope) and implementation view (every element prompt — each is a step
in this cycle). Governed by all Process topics.

## The one-file TDD cycle

RED test (asserting the desired green behavior) → implementation → GREEN → lint.

- Do not edit executable code without first authoring the RED test that proves the
  intended green-state behavior. The RED state is proven by compiler/linter output
  (see [tests](tests.md), [linting-proof](linting-proof.md)), never by running tests.
- Do not advance to another file until the current file's proof — GREEN test, or a
  documented exemption — is complete.

"One file" means one **source** file plus the support it requires: its types,
interface, mock, guard test, guard, and tests. A node may include the types, guard
test, and guard, or exclude any not required by the work; a TDD cycle must always
include the source test and the source.

## Canonical element order (dependency order)

Within a node, elements are built producers-first so every dependency exists when
its consumer is written:

```
interface test → interface → mock → guard test → guard → unit test → implementation → provides → integration test
```

This order is not stylistic — it is the dependency graph. The mock precedes the
guard test so the guard test can use its builders; the guard precedes the unit test
so the implementation can rely on it; provides precedes the integration test so the
consumer can import the finished surface.

### The order is immutable

You may **omit** an element the work does not require (see
[workplan-structure](workplan-structure.md) — conditional omission), but you may never
**reorder** the elements you include, and you may never **merge** two elements into one
step. A test always precedes the code it tests; the mock always precedes the guard test;
the guard always precedes the unit test. "Write the implementation, then the tests" and
"do the test and the implementation together" do not reorder a list — they invert the
dependency graph. They are defects, not alternative orderings.

**Order canary.** A node, or a proposed plan, in which an implementation precedes its
test, or in which a test and its implementation share one step, is malformed and
discarded (see [traceability](traceability.md)). The order is checkable at a glance, so
getting it wrong is proof the sequence was not followed.

## Bottom-up across files and modules

- Construct types, interfaces, and helpers before their consumers. Write consumer
  tests only after their producers exist.
- Preserve bottom-up compilation — the application stays buildable and provable at
  every step. Never leave it in a broken state between steps.
- This is the same direction modules depend in (see [boundaries](boundaries.md)).

## Locate before create

Always try to locate an existing resource — type, guard, test, source — before
assuming it does not exist, proposing its creation, or creating it inline. If a
required resource is genuinely missing, that is a discovery: report and halt (see
[discovery-halt](discovery-halt.md)).

### Search the invariant, never the convention

The standards in this repo describe where the codebase is **going**. They do not describe
the code you are searching. A resource that predates a standard, or was written against an
older one, is still the resource — and it will not answer to the name, the file, or the
folder the standard would give it today.

So never search on a convention. Do not search for what a symbol would be **called**, or
look only where it would **live**. Both are guesses, and a guess that returns nothing
produces a confident "it does not exist" about something that does.

Search on the **structural invariant** — the property that makes a thing what it is,
whatever it was named and wherever it was put. Each topic names the invariant for its own
resource: the type predicate `is SomeType` for a guard (see [guards](guards.md)), the
declared type for a mock (see [mocks](mocks.md)). Search the repo on that, not a folder.

When the invariant search comes up empty, existing **call sites** are the last fact
available: if anything already consumes the resource, it imports it from wherever it truly
lives. Follow the consumer to the definition.

### Three outcomes, and only one of them is "create it"

**Found and usable.** Use it. If it is non-compliant in ways that do not block you — wrong
name, wrong folder, owned by an interface that should not own it — **use it anyway and
record the debt** in the workplan's To-Do list (see
[workplan-structure](workplan-structure.md)). Writing a second, compliant copy beside it is
duplication, and the duplicate is a worse defect than the non-compliance it was meant to
avoid. Legacy is closed incrementally, by scheduled work, never opportunistically in the
middle of another task.

**Found, but missing what this task needs.** The builder exists but doesn't accept overrides, the invalidator does not exist, the guard exists but does not cover the property you need. Completing it means editing
a file you were not given, which is a discovery: report and halt with the node that adds it.

**Not found.** Report and halt — and the report carries the **exact patterns searched and
the paths searched**. A halt report without search evidence is a guess (see
[guards](guards.md), [discovery-halt](discovery-halt.md)).

**Two candidates.** Where the search returns more than one — the one the repo actually
imports, and another nearer the interface that should own it — report both and let the user
choose. Picking silently entrenches whichever you picked, and if you picked the wrong one
the next agent finds three.

## Types and interfaces are test-exempt

Types and interfaces are exempt from RED/GREEN unit testing — their contract is
proven by the interface test's typed assignments (see [tests](tests.md#interface)),
not by a behavioral test of their own. They still follow the Read → … → Halt loop.

## Precedence

This topic outranks the workplan. A node step that edits executable code before its
RED test, builds a consumer before its producer, advances past an unproven file,
recreates a resource that already exists, or leaves the build broken between steps is
defective — comply with this topic and report the discrepancy.
