# Mock Generation

Generate a single mock file for the interface.

## Purpose

The mock file provides reusable builders and function mocks for unit tests, integration tests, and runtime type guard tests.

Builders generate valid objects only. Corruption is handled by per-type invalidators in the same file, which return unknown.

Interface tests do not use mocks.

---

## Ownership

The mock file only provides mocks for symbols **owned by the interface being mocked**.

Generate mocks for every symbol exported by the interface.

Do **not** generate mocks for:

* imported symbols
* databases
* repositories
* APIs
* external services
* objects owned by another interface
* wrappers around another interface's mock

The mock file owns only the symbols defined by the interface.

---

## Naming

Use the production names.

Functions are named:

```ts
mockFunctionName
```

Object builders are named:

```ts
buildObjectName
```

Override types are named:

```ts
ObjectNameOverrides
```

Invalidator types are named: 

```ts
InvalidObjectName

ObjectNameCorruptions
``` 

Do not invent new names.

Do not append unnecessary descriptors such as:

* `Default`
* `NoOverrides`
* `MissingDependency`
* `Contract`
* `Guard`
* `Unit`
* `Integration`

Builders with overrides replace specialized mock variants.

---

## Builders

Generate one builder for every object type owned by the interface.

Each builder produces one valid default object and accepts typed overrides for every property.

Use this pattern.

```ts
// Builder — valid objects only, returnType always preserved
export type MyObjectOverrides = Partial<MyObject>;

export function buildMyObject(overrides?: MyObjectOverrides): MyObject {
  const base: MyObject = {
    foo: buildFoo(),
    bar: buildBar(),
  };
  return overrides ? { ...base, ...overrides } : base;
}
```

To test a missing required field, rest-destructure the builder output — 

```ts
const { foo: _omit, ...missingFoo } = buildMyObject();
```

which is honestly typed as `Omit<MyObject, "foo">` and feeds the guard as `unknown`.

Requirements:

* every property has a default value
* callers provide only the properties they wish to override
* omitted properties retain their default values
* builders always return valid production objects
* builders must exactly match the production types
* builders must use the production type names
* builders must not invent new object shapes

---

## Function Mocks

Generate one mock function for every exported function.

Mock functions should compose the generated builders rather than duplicating object construction.

---

## Invalid Objects

Mock builders do **not** generate invalid objects.

Negative tests intentionally construct malformed runtime data using the invalidators generated in the mock file.

Do not widen production interfaces to permit invalid values.

Do not modify production types to accommodate tests.

Production interfaces remain the single source of truth.

---

## Forbidden

Do not:

* modify production interfaces
* widen production types
* invent new object shapes
* invent new type names
* use type assertions (`as`)
* use `satisfies`
* use overloads
* use type aliases to weaken type checking
* use generic merge helpers
* generate specialized mock variants instead of using overrides
* wrap one mock with another mock
* duplicate builders
* mock imported symbols
* mock databases, repositories, or external services
* create generic or shared invalidators (`invalidate<T>`)

When in doubt, mirror the production interface exactly. The mock file exists to provide reusable builders and function mocks for the symbols owned by that interface—nothing more.

## Invalidator Pattern

Runtime type guards validate data received from external systems.

Negative tests must construct malformed runtime objects using the invalidator pattern rather than weakening the production types or the builders.

Builders always produce valid production objects.

The invalidator is responsible for intentionally corrupting an otherwise valid object.

Generate one invalidator for every object type owned by the interface, in the mock file. Each invalidator composes its builder for the valid baseline.

Use this pattern:

```ts
// Invalidator — one per owned object type, generated in the mock file alongside its builder
export type MyObjectCorruptions = { [K in keyof MyObject]?: unknown };

export function invalidateMyObject(corruptions: MyObjectCorruptions): unknown {
  return { ...buildMyObject(), ...corruptions };
}

// valid path — returnType preserved
const object = buildMyObject({ foo: someFoo });

// invalid path — keys typo-checked, values unrestricted, no cast, guard takes unknown
expect(isMyObject(invalidateMyObject({ foo: null }))).toBe(false);
expect(isMyObject(invalidateMyObject({ bar: 42 }))).toBe(false);
```

The invalidator exists specifically to simulate untrusted runtime data, such as:

* external APIs
* databases
* network payloads
* deserialized JSON
* user input

Runtime type safety is never bypassed anywhere, including the invalidator. The invalidator returns unknown — the honest type for untrusted runtime data — and only the runtime type guard classifies it.

Builders remain fully type-safe.

Do not modify production interfaces or builder signatures to accommodate invalid objects.

## Architecture Pattern

production interface
        │
        ▼
 typed builder
        │
        ▼
 valid object
        │
        ▼
 invalidate(...)
        │
        ▼
 malformed runtime object
        │
        ▼
 runtime type guard