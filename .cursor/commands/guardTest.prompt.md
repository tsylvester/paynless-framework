## Guard Test Generation

This repo follows TDD. The interface and mock file exist and compile. The guard file may or may not exist, and may or may not export the symbol you want to test, on purpose.

You will write exactly one new file: the guard test. You may add missing builders or invalidators to the mock file **only** in the exact form the Mock Generation standard requires. You will not create or edit any other file.

### What success is

The task is complete when all four are true:

1. The test file contains only imports, test blocks, and assertions.
2. Every guard the test calls is imported from the guard file by its production name (`isObjectName`). Every fixture comes from the mock file's builders and invalidators.
3. The compiler reports missing exports from the guard file — **and nothing else**. The interface and mock imports must resolve cleanly; an error anywhere other than the guard imports means the test itself is broken, not RED.
4. Your final report lists the guard-file errors verbatim as proof the test is RED.

The compiler errors are the deliverable. Do not fix them. Do not respond to the linter. A guard test that compiles cleanly at this stage is a failed task.

### What a guard test proves

A guard takes `unknown` and decides. The test proves both directions:

* **No false negatives**: every valid object — builder output, with and without overrides — returns `true`.
* **No false positives**: every malformed input — invalidator output, omitted required fields, non-objects — returns `false`.

Because the guard's parameter is `unknown` and the invalidator returns `unknown`, **no cast is ever needed anywhere in a guard test**. If you feel the need for `as`, `satisfies`, or a type annotation to make a fixture fit, you are constructing the fixture wrong — use the builder or the invalidator.

### Case checklist — mechanical, per owned guard

For `isOwnedObject`:

1. `buildOwnedObject()` → `true`
2. `buildOwnedObject({ ...valid overrides... })` → `true`
3. `null`, `undefined`, a primitive, an array → `false`
4. Each property corrupted: `invalidateOwnedObject({ property: <wrong value> })` → `false` — one case per property, including properties whose types are imported. One corruption per imported-type property proves the guard delegates; enumerating that type's internal invalid states is its own guard test's job, in its home package.
5. Each required property omitted (rest-destructure the builder output) → `false`
6. Each optional property absent → `true`; present but corrupted → `false`

### Scope

Ownership question: **who owns this symbol?**

* Guard for a type owned by this interface → tested here.
* Guard for an imported type → tested in its home package, never here. Do not import a foreign guard into this test for any purpose. The foreign guard is exercised indirectly through case 4, and that is the only contact this test has with it.

### Forbidden substitutes

```ts
// FORBIDDEN 1 — creating or editing the guard file
// "I'm only creating the file" is editing the guard file. Editing the guard file is not in scope of this task. 
```

```ts
// FORBIDDEN 2 — defining a guard in the test file
function isOwnedObject(value: unknown): value is OwnedObject { ... } // "temporary"
```

A test that defines what it tests proves nothing.

```ts
// FORBIDDEN 3 — silencing the compiler
// @ts-expect-error / @ts-ignore / deno-lint-ignore
const invalid = { foo: null } as unknown as OwnedObject;
```

The invalidator exists so these methods will never be present in a guard test. Corrupt data is `unknown`, honestly.

```ts
// FORBIDDEN 4 — hand-rolled fixtures duplicating the builders
const valid = { foo: makeFoo(), bar: makeBar() };  // buildOwnedObject() exists — use it
```

```ts
// FORBIDDEN 5 — testing a foreign guard
import { isSomeType } from "../somePath/somePath.guard.ts";
Deno.test("isSomeType rejects null", ...)  // SomeType's home package owns this test
```

```ts
// FORBIDDEN 6 — building fixtures for imported types by hand
const someObject = { field: "x" };  // SomeType's mock file exports buildSomeType — locate and use it
```

### Missing builder or invalidator

If the mock file lacks a builder or invalidator this test needs, add it to the **mock file** in the exact four-symbol form the Mock Generation standard defines — `ObjectNameOverrides`, `buildObjectName`, `ObjectNameCorruptions`, `invalidateObjectName` — nothing else. Helpers never go in the test file. If the missing builder is for an **imported** type, its mock belongs to its home package: search for it there (type: `SomeType`); if it truly does not exist, halt and report, exactly as the guard standard requires for missing guards.

### Halt rule

If completing the test appears to require touching any file other than the guard test and the mock file, importing a foreign guard, or hand-building a fixture for a type you don't own — stop. State which file or symbol, what you wanted to do, and why the test seemed to need it. Then halt.

Halting with that explanation is the successful outcome. A compiling test produced by any substitute is a failed task.