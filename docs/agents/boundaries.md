# Boundaries

A module (a folder) exposes itself to the rest of the repo through exactly one
public surface — its `provides` file. This topic owns that surface and the
direction of dependencies across it.

Cited by: construction view (workplan node `provides` and `directionality`
sections) and implementation view (provide prompt). Governed by all Process topics.

## The provides file is the only public surface

A folder is a module: it contains everything it needs and exposes only what it
chooses, through named imports and exports. External consumers import **only** from
the module's `provides` file; nothing reaches into a module's internal files
directly.

The `provides` file re-exports every symbol a consumer needs — interfaces, guards,
functions, and mocks — so a consumer can build against the module and test against
it from one import point:

```ts
// enqueueCompressJobs.provides.ts
export * from "./enqueueCompressJobs.ts";
export * from "./enqueueCompressJobs.interface.ts";
export * from "./enqueueCompressJobs.guard.ts";
export * from "./enqueueCompressJobs.mock.ts";
```

The mock is part of the public surface on purpose: a consumer's tests import the
module's official mock rather than hand-rolling a test double (see [mocks](mocks.md)).

## Barrels are the only place to re-export

Re-exporting is permitted **only** in barrel files — the ones named `index` or
`provides`. No other file re-exports. This is the home of the barrel rule that
[types](types.md) points to.

## Directionality

- **Deps face inward, provides face outward.** A module depends on the modules
  beneath it and is depended on by the modules above it.
- No reverse dependencies. No lateral layer violations.
- No dependency cycles unless a cycle is explicitly justified and recorded.
- This is the same order the repo builds in — producers before consumers (see
  [tdd-ordering](tdd-ordering.md)).

## Precedence

This topic outranks the workplan. A node step that imports from a module's internal
file instead of its `provides`, re-exports outside a barrel, omits a symbol a
consumer needs from `provides`, or introduces a reverse/lateral/cyclic dependency is
defective — comply with this topic and report the discrepancy.
