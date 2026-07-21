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

## Types and interfaces are test-exempt

Types and interfaces are exempt from RED/GREEN unit testing — their contract is
proven by the interface test's typed assignments (see [tests](tests.md#interface)),
not by a behavioral test of their own. They still follow the Read → … → Halt loop.

## Precedence

This topic outranks the workplan. A node step that edits executable code before its
RED test, builds a consumer before its producer, advances past an unproven file,
recreates a resource that already exists, or leaves the build broken between steps is
defective — comply with this topic and report the discrepancy.
