# Types

Every object and variable owned by the repo is explicitly and strictly typed.
This topic owns the typing rules; [composition](composition.md) owns the function
signature shape that uses them.

Cited by: construction view (workplan node `interface` element) and implementation
view (interface prompt, and every file author, since every file types its values).
Governed by all Process topics.

## Strict typing

- Explicit types everywhere for any object the repo owns. No `any`, `as`,
  `as const`, inline ad-hoc types, or casts.
- Every object and variable is typed. If you find an untyped var or object while
  working, stop, report the discovery, propose the node to type it, and halt
  (see [discovery-halt](discovery-halt.md)).
- Construct full objects that satisfy their interface. Compose complex objects
  from smaller typed components. Never rely on defaults, fallbacks, or backfilling
  to "heal" missing data.

### The one casting exception

Casting is permitted **only** for external-service clients whose types the repo
does not own and are not publicly, fully defined (Supabase, Stripe, Netlify, and
the like). This is a closed list of a kind, not a general escape hatch.

Intentionally malformed test data is **not** an exception. Corruption is produced
by the per-type invalidator, which returns `unknown` — no cast is needed or
allowed. See [mocks](mocks.md). (This retires the former "use `as` on an incomplete
test object" rule; it no longer exists.)

## Narrowest type wins

- Use the narrowest type available for the purpose. Never use a broad type where a
  narrower, more specific one exists.
- Locate and use application types before database types. Database types are used
  only when no application type exists.

## `unknown` — forbidden as a dodge, required at a boundary

`unknown` may **not** substitute for locating and applying a specific application
or database type. Typing something `unknown` to avoid finding its real type is a
laziness dodge and is prohibited.

`unknown` **is** required at a genuine runtime boundary — where untrusted data
enters (queue, JSON, external API, DB row, user input) and is immediately narrowed
by a guard. This is the strictest possible handling, not the weakest: `unknown`
forbids all access until proven. See [guards](guards.md#guard-on-entry-validating-functions-take-unknown).

## No inline or renegotiated types

- Never redefine an object's type inline, for any reason. Use the exact type
  defined for it and declare that type when instancing the object.
- If a non-primitive value has no locatable type, explain the problem and halt. Do
  **not** type it inline.
- Types are a fixed contract to the application and the user. Do not edit a type
  you were not explicitly given permission to edit, and never edit a type to dodge
  strict compliance with these rules.

### Inline unions are inline type definitions — always prohibited

Writing `A | B` at any annotation site — a variable, parameter, return, or cast —
mints a new type, `A | B`, at that site. That the members `A` and `B` are each
already named and defined is **irrelevant**: the *union* is not named and exists in
no definition. `A | B` is a third type, composed inline at the point of use. It is
an inline type definition, and it is prohibited, always.

Do not reason around this. "Both members are already typed, so the union is not a
redefinition" is false — the members being defined does not make the union defined.
Unionizing two named types inline is still typing inline, because the union does not
exist in any definition. The only question is:

> **Does this exact union exist as a named type, declared in a type file, that I
> imported?** If no, it is inline — prohibited.

You always know which concrete types you may receive. Branch on them explicitly, and
inside each branch hold and guard the **one** exact type. Never carry a union in a
variable so you can "narrow it later."

```ts
// WRONG — inline union; the value is now "either", and every use must re-narrow
let item: itemA | itemB;
if (isItemA(raw)) { item = raw; } else { item = other; }

// RIGHT — branch first, then handle one concrete, guarded type per branch
if (isItemA(raw)) {
  return handleItemA(raw);      // raw is itemA here — one type
}
if (isItemB(raw)) {
  return handleItemB(raw);  // raw is itemB here — one type
}
return failClosed(raw);          // exhaustive; nothing falls through untyped
```

A union is only ever *used* through a name that already exists in a definition:

```ts
// declared once, in the owning type file — never at the use site:
export type itemAOrB = itemA | itemB;

// at the use site — a named import, not an inline composition:
import type { itemAOrB } from "./x.interface.ts";
```

If you need a union that does not yet exist as a named type, that is a **type
change**: stop, propose the node to declare it in its owning interface, and halt
(see [discovery-halt](discovery-halt.md)). You do not mint it inline.

### Nullable and absent states belong in the definition

A value with a predictable empty state — a front end awaiting user input, an
optional selection, a resource not yet loaded — **is** nullable, and that
nullability is part of its contract. A front end awaits input, so `itemA | null` is
an expected, ordinary state, not an edge case. Declare it where the type is defined:
`selection: itemA | null` in the interface, or a named nullable type the interface
owns. Null is not an afterthought; it is a state you already know the value will
occupy.

Do not under-specify the definition and patch it later. Typing a field `itemA` in
the definition — pretending it is never null — and then widening it to `itemA | null`
in the implementation is two violations at once: an under-specified contract, **and**
an inline union minted at a use site. You knew at definition time the value could be
absent. Model it there.

```ts
// WRONG — definition pretends non-null; implementation widens inline
// interface:  selection: itemA
// impl:       let selection: itemA | null = null;   // ← both wrong

// RIGHT — nullability declared once, in the definition
export interface FormState {
  selection: itemA | null;   // awaiting input is a real, declared state
}

// impl — branch the null case explicitly, then hold the one concrete type:
if (state.selection === null) {
  return promptForSelection();
}
return handleItemA(state.selection); // selection is itemA here — one type
```

If you discover a value must be nullable but its definition does not say so, that is
a **type change**: propose the node to correct the definition in its owning
interface, and halt (see [discovery-halt](discovery-halt.md)). You never add `| null`
at the use site to cover for a definition that should have carried it.

## No production defaults

A ternary is not a type guard — a ternary supplies a default value. Default values
are prohibited in production code. The only defaults permitted anywhere are the
documented, domain-approved defaults inside builders and factories (see
[mocks](mocks.md)), which are test fixtures, not production code.

## Imports

- Use `import type { … }` for type-only imports. The `type` modifier is required
  wherever every imported symbol is a type, so type elision is explicit.
- Never import an entire library with `*`.
- Never alias imports.
- Import another module's symbols from its `provides` barrel, never from an internal
  file of that module (see [boundaries](boundaries.md)).
- Reexporting is permitted only in barrel files (see [boundaries](boundaries.md)).

## Precedence

This topic outranks the workplan. A node step that casts a repo-owned object, types
a value `unknown` to skip finding its real type, redefines a type inline, or edits a
type without authorization is defective — comply with this topic and report the
discrepancy.
