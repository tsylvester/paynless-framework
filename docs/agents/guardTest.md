# Guard test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files)
and [fixture rules](tests.md#fixtures-call-the-builder-directly) apply here.

Cited by: construction view (workplan node `guard.test` element) and implementation
view (guardTest prompt). Governed by all Process topics.

The interface and mock file exist and compile. The guard file may not export the
guard yet. Proves the guard has no false positives and no false negatives.

- Only type/interface imports, test blocks, and assertions. Guards imported by production name
  (`isObjectName`); fixtures from builders and invalidators.
- The compiler reports missing exports from the **guard file and nothing else** —
  interface and mock imports resolve cleanly. An error elsewhere means the test is
  broken, not RED.
- No cast anywhere: the guard takes `unknown` and the invalidator returns `unknown`.
  If you reach for `as`, `satisfies`, or a fitting annotation, the fixture is built
  wrong — use the builder or invalidator.
- Never relies on implementation details.


### Case checklist — mechanical, per owned guard

For `isOwnedObject`:

1. `buildOwnedObject()` → `true`
2. `buildOwnedObject({ ...valid overrides... })` → `true`
3. `null`, `undefined`, a primitive, an array → `false`
4. Each property corrupted: `invalidateOwnedObject({ property: <wrong value> })` →
   `false` — one case per property, including imported-typed properties (one
   corruption proves the guard delegates; the imported type's own invalid states are
   its own guard test's job).
5. Each required property omitted (rest-destructure the builder output) → `false`
6. Each optional property absent → `true`; present but corrupted → `false`

Rendered — copy this shape, one test file per owned guard:

```ts
import { isOwnedObject } from "./myInterface.guard.ts";
import { buildOwnedObject, invalidateOwnedObject } from "./myInterface.mock.ts";

test("isOwnedObject accepts the valid default", () => {
  assert(isOwnedObject(buildOwnedObject()));
});

test("isOwnedObject accepts valid overrides", () => {
  assert(isOwnedObject(buildOwnedObject({ foo: someValidFoo })));
});

test("isOwnedObject rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) assert(!isOwnedObject(x));
});

test("isOwnedObject rejects each corrupted property", () => {
  assert(!isOwnedObject(invalidateOwnedObject({ foo: null })));
  assert(!isOwnedObject(invalidateOwnedObject({ bar: 42 })));
});

test("isOwnedObject rejects each omitted required property", () => {
  const { foo: _f, ...missingFoo } = buildOwnedObject();
  assert(!isOwnedObject(missingFoo));
});
```

Scope: test only guards for types this interface owns. A foreign guard is tested in
its home package and is exercised here only indirectly through case 4 — never
imported into this test.

Forbidden: importing the implementation, creating/editing the guard file; defining a guard in the test; silencing
the compiler; hand-rolled fixtures duplicating builders; testing a foreign guard;
hand-building fixtures for imported types. If the mock file lacks a needed builder or
invalidator, add it there in the four-symbol form (see [mocks](mocks.md)); if it
belongs to an imported type, find it in its home or halt.
