# Guards

A guard takes `unknown` and decides whether a value is a member of a production
type, narrowing it for the compiler. The guard file provides one guard for every
type the interface **owns**.

Cited by: construction view (workplan node `guard` element) and implementation
view (guard prompt). Governed by all Process topics.

## Purpose — the three jobs a guard does

1. **Narrow `unknown` at a runtime boundary** — data from a queue, JSON, an API,
   a DB row, or user input, where the compiler has no jurisdiction over shape.
2. **Enforce invariants the type system cannot express** — non-empty strings,
   numeric ranges, enum membership, cross-field rules ("`sourceType` contribution
   requires `documentKey`"). The compiler checks shape; the guard checks content.
3. **Channel management** — a runtime tripwire so a half-formed object hits a
   brick wall at every boundary crossing, regardless of who authored the producer.

The guard is only a tripwire if the guard itself is complete. The thing that
certifies completeness is the guard **test** (see [tests](tests.md#guard)) — the
per-property case checklist. Guard without guard-test is a tripwire the author can
quietly disconnect.

## Guard everything (implementer) — uniformity, no judgment

Write a guard for **every** type the interface exports, deps included. The
implementer never classifies a type as "needs a guard or not" — every owned type
gets one.

The **body** of each guard is what varies, and choosing it is author guidance, not
implementer judgment:

- **Data types** (payload, params, produced objects) → check invariants: presence,
  non-empty, ranges, enum membership, cross-field rules, and the type of every
  property (delegating to owned or imported guards).
- **Deps / behavior types** → presence-of-method checks only. These are shallow by
  nature: a guard can assert `typeof x.warn === "function"`, never that it behaves.
  A passing deps-guard test proves presence, never behavior — never read it as
  behavioral coverage.

## The one rule — authorship, not invocation

A guard is **written** in exactly one file: the guard file of the interface that
owns the type. A guard is **called** from every guard that validates an object
containing that type.

"Guards do not guard imported symbols" means: do not **write** a guard for an
imported type here. It does **not** mean the property is unchecked. Every property
of every owned object is checked, always. The only question is where the check
comes from — written here, or imported from the type's owner.

### Per-property decision procedure

For each property of each owned object, ask one question: **which interface owns
this property's type?**

1. **This interface** → call the guard written in this file.
2. **Another interface (or a shared type-guard package)** → import that interface's
   guard and call it.
3. **The owner's guard file has no guard for that type** → STOP. Report and halt.

There is no fourth option.

```ts
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isSomeType } from "../somePath/somePath.guard.ts";
import type { LocalStatus, OwnedObject } from "./myInterface.interface.ts";

export function isLocalStatus(value: unknown): value is LocalStatus {
  return value === "pending" || value === "complete";     // owned → written here
}

export function isOwnedObject(value: unknown): value is OwnedObject {
  if (!isRecord(value)) return false;
  if (!("localSymbol" in value) || !("someObject" in value)) return false;
  if (!isLocalStatus(value.localSymbol)) return false;    // local type → local guard
  if (!isSomeType(value.someObject)) return false;        // imported type → imported guard, CALLED here
  return true;
}
```

## Finding the imported guard — search the predicate, never a name

You do not guess guard names. A wrong guess followed by "no guard exists" is a
failed task. Guard names are guesses; type predicates are facts. Any guard for
type `SomeType`, whatever it is named, contains `is SomeType` in its signature —
that is what makes it a guard for that type. Search on the **type** name, never the
**property** name.

Run these in order; stop at the first hit:

1. Resolve the property's real type and its home interface/import.
2. Search the owning folder for `is SomeType`.
3. Search the whole repo for `is SomeType` (shared guards live in shared packages).
4. Search for existing callers — another guard already importing it. Copy its import.

Only if all four return nothing may you report no guard exists, and the halt report
must include the exact patterns you searched and where. A halt report without search
evidence is a guess.

## Guard on entry — validating functions take `unknown`

A function that runtime-validates a parameter and can return an error for invalid
values of it accepts **untrusted input**: that parameter is typed `unknown` and
narrowed on the first line. See [types](types.md) for the boundary carve-out.

```ts
export async function myFunction(
  deps: MyFunctionDeps,
  params: MyFunctionParams,
  payload: unknown,
): Promise<MyFunctionReturn> {
  if (!isMyFunctionPayload(payload)) {
    return { error: new MyFunctionValidationError("..."), retriable: false };
  }
  const { victim } = payload; // narrowed to MyFunctionPayload for the whole body
}
```

The guard is the single source of truth for validity. The function body consumes
it and never re-implements shape-checking by hand.

A failed guard **returns the function's error arm — it never throws**. The `unknown`
parameter plus the guard is what moves the validation boundary inside the function,
where a bad payload is a handled return value instead of an exception the caller cannot
catch. `unknown` does not retire the payload type: `MyFunctionPayload` is the guard's
narrowing target, still defined, mocked, and guard-tested. Guard once, here — downstream
functions receive the narrowed type in the trusted form and never re-guard it (see
[composition](composition.md#the-validating-form--what-changes-what-does-not)).

## Classes — `instanceof` for owned classes, shape for their params

"Guard everything" applies to classes, but the guard **body** follows the role the
class plays (the two admitted roles are owned by
[composition](composition.md#classes--two-admitted-roles-and-how-the-signature-maps)).

**An injected adapter** is guarded through the interface it implements, never
through the class. That interface is a deps/behavior type, so its guard is the
presence-of-method check described above — `typeof value.warn === "function"` — and
nothing deeper.

**An owned class the code constructs** is guarded by `instanceof`:

```ts
export function isCompressionKey(value: unknown): value is CompressionKey {
  return value instanceof CompressionKey;
}
```

This is the complete check, not a shortcut. The constructor is the type's only
producer, so membership is nominal: if it was constructed, it is valid, and if it
was not, no property-by-property inspection can make it a member. A hand-rolled
shape check for an owned class is the re-authoring defect below — it duplicates the
class definition and drifts from it the moment a field changes.

**The shape check belongs on the constructor params.** That object type is where
untrusted data actually enters, and it takes a full data guard —
`isCompressionKeyConstructorParams` — checking presence, invariants, and the type of
every property, per the per-property procedure above.

A class instance is never a boundary type. Nothing arrives from a queue, JSON body,
or DB row as an instance — serialization yields a plain object, which is
params-shaped, not an instance. If you believe you are receiving an instance across
a runtime boundary, you are receiving its params: guard those, then construct.

## Forbidden substitutes

If the code matches any of these, the guard is wrong — even if it compiles, even
if tests pass:

```ts
function isSomeType(value: unknown): value is SomeType { ... }   // 1 — re-authoring a foreign guard
```
```ts
if (!isRecord(value.someObject)) return false;                  // 2 — inlining foreign structure
if (!isNonEmptyString(value.someObject.field)) return false;
```
```ts
if (!("someObject" in value)) return false;                     // 3 — presence-only / vacuous check
```
```ts
if (!isRecord(value)) return false;                             // 4 — shape check for an owned class
if (!isNonEmptyString(value.bucket)) return false;              //     (use instanceof)
```

Re-authoring drifts from the owner's definition; inlining is the same violation
with the function name deleted; a vacuous `isRecord` where the type has structure
is omission; a shape check for an owned class duplicates its constructor and
accepts plain objects the constructor never produced.

## Missing guard → halt

If the owning interface's guard file exports no guard for an imported type: do not
write it here, do not inline it, do not weaken the check, do not skip the property.
Stop and report the type name, the property that needs it, the guard file you
checked, and that the owner must export the guard first. See [discovery-halt](discovery-halt.md).

**Halting with that report is the successful outcome.** A compiling guard produced
by any forbidden substitute is a failed task.

## Precedence

This topic outranks the workplan. A node step that says to inline a foreign type's
structure, omit a required check, or write a guard for a type this interface does
not own is defective — comply with this topic and report the discrepancy.
