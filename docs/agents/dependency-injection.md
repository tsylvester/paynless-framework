# Dependency Injection

Dependencies are constructed at the application boundary and provided to the operation. This topic owns how deps are wired, the context object, and why injected deps are trusted.

Cited by: construction view (workplan node `deps` / `context_slice` sections and `implementation` element) and implementation view (implement prompt). Governed by all Process topics.

## Inject at the boundary

- Construct dependencies at the application boundary and provide them to the top-level operation. Build an adapter/interface for every external dependency and wire it at that boundary.
- Preserve bottom-up compilation: adapters and types before their consumers (see [tdd-ordering](tdd-ordering.md)).
- Type guards are **not** dependencies. They are not injected; they are called.

## Deps are trusted — jurisdiction

`deps` are constructed in trusted TypeScript by the composition root and are never serialized. The compiler has full jurisdiction over how they are wired, so:

- `deps` is typed **strong**, never `unknown`, and never guarded at function entry.
- Typing `deps` as `unknown` would blind the compiler exactly where it is competent and defeat DI itself — DI works *because* the compiler checks that what you inject satisfies the deps interface.

Trusting injected deps is not the "hidden global everything depends on" anti-pattern — it is explicit, typed, testable trust declared at the injection seam. See [composition](composition.md) for the deps/params/payload jurisdiction rule and [guards](guards.md) for what does get guarded.

## Context object (RequestContext / ExecutionContext)

A single, strictly typed, immutable context object may be created at the operation boundary and passed down the call chain to avoid deep prop-drilling. This is the only factory that lives with DI.

- Fully typed, **no optional fields**, constructed by a typed context factory.
- Immutable inside the execution flow.
- Carries shared cross-cutting deps (logger, config, db handles, auth, metrics, wallets).
- The factory sets **every** field explicitly — no hidden defaults in code or in the context. Used in both tests and production wiring so behavior has parity.

Leaf functions accept either only the context object or explicit deps derived from it — choose one consistent pattern per module.

## Refactor triggers → halt

Stop, report the discovery, propose the node, and halt (see [discovery-halt](discovery-halt.md)) when:

- a file exceeds 600 lines — propose a decomposition with clear SOC / DRY;
- you are tempted to create a deeply nested function — propose extracting smaller functions;
- you are working on a function that does not use DI, is too long, or is too complex.

One function per file is owned by [composition](composition.md).

## Precedence

This topic outranks the workplan. A node step that skips an adapter for an external dependency, gives a context factory optional fields or hidden defaults, guards or `unknown`-types injected deps, or injects a type guard is defective — comply with this topic and report the discrepancy.

