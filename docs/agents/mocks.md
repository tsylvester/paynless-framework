# Mocks

The mock file provides reusable builders, invalidators, and function mocks for
the symbols an interface **owns**. It is consumed by unit tests, integration
tests, and guard tests.

Cited by: construction view (workplan node `mock` element) and implementation
view (mock prompt). Governed by all Process topics.

## Purpose

- Builders generate **valid** production objects only.
- Invalidators generate corrupt runtime data, typed `unknown`.
- Function mocks **are** the production function type, exactly.

Interface tests do not use mocks.

## Ownership

Provide mocks only for symbols owned by the interface being mocked:

- a builder and an invalidator for every owned **object type**;
- a mock for every owned **function**.

An owned symbol that is neither an object type nor a function needs no mock — an enum,
a union or primitive/string-literal type alias, or a constant is used directly by its
production value or type, and the object-type *members* of a union each get their own
builder. Guards are not mocked here (see [guards](guards.md)).

Do **not** mock:

- imported symbols
- databases, repositories, APIs, external services
- objects owned by another interface
- wrappers around another interface's mock

Imported types are mocked by their own home package — locate and use those (search
for `buildSomeType`); if none exists, halt and report per [discovery-halt](discovery-halt.md).

## Naming — four symbols per owned object type

Use production names. Per owned object type, generate exactly:

- `ObjectNameOverrides` — the override type
- `buildObjectName` — the builder
- `ObjectNameCorruptions` — the corruption type
- `invalidateObjectName` — the invalidator

Per owned function, generate `mockFunctionName`.

Do not invent names. Do not append descriptors (`Default`, `NoOverrides`,
`Contract`, `Guard`, `Unit`, `Integration`, `MissingDependency`). There is no
`InvalidObjectName` or any other invalidator naming.

## Builders — valid objects only

Overrides are `Partial<T>`. The builder returns a valid production object;
overrides replace defaults; omitted properties keep defaults. The return type is
always the production type.

```ts
export type MyObjectOverrides = Partial<MyObject>;

export function buildMyObject(overrides?: MyObjectOverrides): MyObject {
  const base: MyObject = {
    foo: buildFoo(),
    bar: buildBar(),
  };
  return overrides ? { ...base, ...overrides } : base;
}
```

Every property has a default. Builders exactly match production types and names;
they never invent shapes and never produce invalid objects.

### Missing-field corruption

To test a missing required field, rest-destructure the builder output — honestly
typed as `Omit<MyObject, "foo">`, fed to the guard as `unknown`:

```ts
const { foo: _omit, ...missingFoo } = buildMyObject();
```

## Invalidators — corruption, typed `unknown`

One invalidator per owned object type, composing its builder for the valid
baseline. Keys are checked (`keyof T`); values are unrestricted; the return is
`unknown`, so **no cast is ever needed** at the call site.

```ts
export type MyObjectCorruptions = { [K in keyof MyObject]?: unknown };

export function invalidateMyObject(corruptions: MyObjectCorruptions): unknown {
  return { ...buildMyObject(), ...corruptions };
}
```

```ts
// valid — returnType preserved
const object = buildMyObject({ foo: someFoo });

// invalid — keys typo-checked, values unrestricted, no cast, guard takes unknown
expect(isMyObject(invalidateMyObject({ foo: null }))).toBe(false);
expect(isMyObject(invalidateMyObject({ bar: 42 }))).toBe(false);
```

Runtime type safety is never bypassed anywhere, **including the invalidator**. It
returns `unknown` — the honest type for untrusted runtime data — and only the
runtime guard classifies it. Builders always produce valid objects; corruption
lives only in invalidators. Do not create generic or shared invalidators
(`invalidate<T>`); each is per-type, in this file.

## Function mocks — the production function, nothing else

`mockFunctionName` **is** an implementation of `FunctionName`: identical
signature, identical return type, zero extra parameters. It returns built
defaults.

```ts
export const mockFunctionName: FunctionName = async (deps, params, payload) => {
  return buildFunctionNameSuccessReturn();
};
```

A test needing different behavior does not configure the mock — it declares its
own production-typed function inside the test, composed from builders:

```ts
const failingFn: FunctionName = async () => buildFunctionNameErrorReturn();
```

Forbidden — configuration surfaces in every form:

```ts
mockFunctionName(options?: { result?; handler? })   // options bag
createFunctionNameMock(...): { fn; calls }          // harness bundle
mockFunctionName(result: FunctionNameReturn)        // parameterized factory
```

No call-recording in mocks — no `calls` arrays, counters, captured args,
`.mock` properties, or `reset()` methods. The test framework's spy facility
wraps any function and records invocations; recording is applied by the test
author at the call site, never baked into the mock.

## Litmus

Every export in the mock file is typed by a name from the interface file —
builders return production object types, invalidators return `unknown`, function
mocks are production function types. Any export whose type had to be invented is
not a mock of this interface; it is new machinery, and new machinery is forbidden.

## Precedence

This topic outranks the workplan. If a node step instructs a null/undefined-accepting
builder, a configurable mock factory, a call-recording mock, or a `createXMock`
bundle, the step is defective — build the compliant symbols and report the
discrepancy in your final report. Do not implement the defective step; do not
silently ignore it.

## Residual limitation — exactOptionalPropertyTypes

`Partial<T>` overrides admit explicit `undefined`: `buildMyObject({ foo: undefined })`
type-checks and clobbers a required field. Full enforcement requires
`exactOptionalPropertyTypes`, deferred repo-wide. Interim convention: callers omit
properties rather than pass `undefined`. Enabling EOPT makes the violation a
compile error.

## Forbidden (summary)

modify or widen production types · invent shapes or type names · `as` ·
`satisfies` · overloads · type aliases that weaken checking · generic merge
helpers · specialized mock variants instead of overrides · wrap one mock with
another · duplicate builders · mock imported symbols / databases / repositories /
external services · generic or shared invalidators.

## Architecture

```
production interface
        │
        ▼
 typed builder ──► valid object
        │
        ▼
 invalidate(...) ──► malformed runtime object (unknown)
        │
        ▼
 runtime type guard
```
