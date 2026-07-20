Now write the guards to satisfy the guard tests. Follow the work plan descriptions exactly.

### The one rule

A guard is **written** in exactly one file: the guard file of the interface that owns the type.

A guard is **called** from every guard that validates an object containing that type.

"Guards do not guard imported symbols" means: do not **write** a guard for an imported type in this file. It does **not** mean the property is unchecked. Every property of every owned object is checked, always. The only question is where the check comes from: written here, or imported from the type's owner.

### Per-property decision procedure

For each property of each owned object, ask exactly one question: **which interface owns this property's type?**

1. **This interface** → call the guard for that type written in this file.
2. **Another interface (or the shared type-guards package)** → import the guard from that interface's guard file and call it.
3. **The owner's guard file has no guard for that type** → STOP. Do not improvise. Report and halt (see below).

There is no fourth option.

### Example

```ts
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isSomeType } from "../somePath/somePath.guard.ts";
import type { LocalStatus, OwnedObject } from "./myInterface.interface.ts";

// LocalStatus is owned by this interface → its guard is WRITTEN here
export function isLocalStatus(value: unknown): value is LocalStatus {
  return value === "pending" || value === "complete";
}

// OwnedObject is owned by this interface → its guard is WRITTEN here
export function isOwnedObject(value: unknown): value is OwnedObject {
  if (!isRecord(value)) return false;
  if (!("localSymbol" in value) || !("someObject" in value)) return false;
  if (!isLocalStatus(value.localSymbol)) return false; // local type → local guard
  if (!isSomeType(value.someObject)) return false;     // imported type → imported guard, CALLED here
  return true;
}
```

Both properties are checked. Neither property is skipped. `isSomeType` is imported, never rewritten.

### The three forbidden substitutes

If your code looks like any of these, the guard is wrong. These are not alternatives — they are failures.

```ts
// FORBIDDEN 1 — re-authoring a foreign guard locally
function isSomeType(value: unknown): value is SomeType { ... }
```

SomeType's owner already defines what valid means. A second definition silently drifts from the first.

```ts
// FORBIDDEN 2 — inlining the foreign type's structure
if (!isRecord(value.someObject)) return false;
if (!isNonEmptyString(value.someObject.field)) return false;
```

This is the same authorship violation as FORBIDDEN 1 with the function name deleted — harder to find, drifts the same way.

```ts
// FORBIDDEN 3 — omitting or weakening the check
if (!("someObject" in value)) return false;   // presence only — value unchecked
// or
if (!isRecord(value.someObject)) return false; // vacuous — any object passes
```

`someObject` is required and structured. A guard that passes invalid values is a wrong guard. A vacuous check (`isRecord` alone where the type has structure) counts as omission.

### Missing imported guard → halt

If the owning interface's guard file exports no guard for the imported type:

* do not write it here
* do not inline it
* do not weaken the check
* do not skip the property

### Finding the imported guard

You do not guess guard names. A wrong guess followed by "no guard exists" is a failed task.

Guard names are guesses; type predicates are facts. Any guard for type `SomeType`, regardless of what the function is named, must contain the text `is SomeType` in its signature — that is what makes it a guard for that type. Search for the predicate, never for a name you invented.

Run these searches in order. Stop at the first hit.

1. **Resolve the type's real name and home.** Follow the property's type annotation to its import statement and the defining file. Search on the *type* name, never the *property* name — for `someObject: SomeType` the property `someObject` is typed `SomeType`, so `SomeType` is the search term.
2. **Search the owning folder** for the predicate: `is SomeType`.
3. **Search the whole repo** for the predicate: `is SomeType`. Guards for shared types live in shared type-guard packages, not next to the type.
4. **Search for existing callers**: other guard files that validate objects containing this type already import its guard. Find one and copy its import.

Only if all four searches return nothing may you report that no guard exists — and the halt report must include the exact search patterns you ran and where you ran them. A halt report without search evidence is a guess, and a guess is a failed task in both directions: writing a guard that already exists elsewhere, and halting when the guard was there to find.

### If there is no guard for the symbol

Stop and report: the type name, the property that needs it, the guard file you checked, and that the owning interface must export the guard before this guard can be completed.

**Halting with this report is the successful outcome.** A compiling guard produced by any of the three forbidden substitutes is a failed task, even if the tests pass.
