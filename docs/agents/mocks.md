# Mocks

The mock file provides reusable builders, invalidators, and function mocks for the symbols an interface **owns**. It is consumed by unit tests, integration tests, and guard tests.

Cited by: construction view (workplan node `mock` element) and implementation view (mock prompt). Governed by all Process topics.

## Purpose

- Builders generate **valid** production objects only.
- Invalidators generate corrupt runtime data, typed `unknown`.
- Function mocks **are** the production function type, exactly.

Interface tests do not use mocks.

## Ownership

Provide mocks only for symbols owned by the interface being mocked:

- a builder and an invalidator for every owned **object type**;
- a mock for every owned **function**.

An owned symbol that is neither an object type nor a function needs no mock — an enum, a union or primitive/string-literal type alias, or a constant is used directly by its production value or type, and the object-type *members* of a union each get their own builder. Guards are not mocked here (see [guards](guards.md)).

Do **not** mock:

- imported symbols
- databases, repositories, APIs, external services
- objects owned by another interface
- wrappers around another interface's mock

Imported types are mocked by their own home package — locate and use existing mocks. Never assume you know the name of the mock; the **type declaration** of the mock is the invariant that locates it. If no mock for the type exists, halt and report per [discovery-halt](discovery-halt.md).

### Locating an existing mock

The general rule and its three outcomes are owned by [tdd-ordering](tdd-ordering.md#search-the-invariant-never-the-convention) — search the structural invariant, never the name or the folder, because those describe where the codebase is going and not the code you are searching. This section names the invariant for each kind of mock.

- **Builder** — it returns the production type. `SomeType` in the return position is the invariant, whatever the function is called and wherever it lives.
- **Function mock** — it *is* the production function type, so its type annotation is the invariant: a value declared `: SomeFn`.
- **Invalidator** — it returns `unknown` by mandate, so **its signature ties it to nothing**. There is no invariant to search on. Find the builder first, then read the file the builder turned out to live in — and do not assume that file is beside the interface, or that it holds an invalidator at all.

An invalidator that does not exist is the second outcome in [tdd-ordering](tdd-ordering.md#three-outcomes-and-only-one-of-them-is-create-it), not the third: the mock file exists and is missing a symbol, which is another file's edit and so a discovery. Do not write the invalidator into a foreign mock file, and do not substitute a cast or a hand-rolled malformed object for the one that is missing.

A mock found under a non-compliant name, or in an unexpected file, is still the mock. Use it and record the debt; a second, correctly-named copy beside it is duplication, which is forbidden below.

## Which mock does an owned symbol get?

For each symbol the interface owns, ask what it is:

1. An **object type** → a builder and an invalidator (`buildX`, `invalidateX`).
2. A **function** → a function mock (`mockX`).
3. A **union type** → nothing for the union itself; each object-type member gets its own builder (step 1).
4. An **enum, primitive/string-literal alias, or constant** → nothing. It is used directly by its production value or type.
5. A **guard** → nothing here; guards are their own element (see [guards](guards.md)).
6. A **class** → never mocked as a class. It decomposes by who constructs it: injected → mock the interface it implements (step 1); constructed by the code itself → a builder returning a real instance, plus the four symbols on its constructor-params object type (see [Classes](#classes--decompose-never-mock-the-class)).

If a symbol is none of these, it does not belong to this interface — do not mock it.

## Naming — four symbols per owned object type

Use production names. Per owned object type, generate exactly:

- `ObjectNameOverrides` — the override type
- `buildObjectName` — the builder
- `ObjectNameCorruptions` — the corruption type
- `invalidateObjectName` — the invalidator

Per owned function, generate `mockFunctionName`.

Do not invent names. Do not append descriptors (`Default`, `NoOverrides`, `Contract`, `Guard`, `Unit`, `Integration`, `MissingDependency`). There is no `InvalidObjectName` or any other invalidator naming.

## Builders — valid objects only

Overrides are `Partial<T>`. The builder returns a valid production object; overrides replace defaults; omitted properties keep defaults. The return type is always the production type.

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

Every property has a default. Builders exactly match production types and names; they never invent shapes and never produce invalid objects.

### Nested object composition

When an object property is another object type, compose the parent builder from that nested object's builder. This rule applies recursively at every depth. An owned nested type uses its builder in the same mock file; an imported nested type uses the builder from its home package. Do not duplicate the nested type's defaults, create a shallow placeholder, or wrap another interface's mock.

```ts
export interface Address {
  street: string;
  city: string;
}

export interface User {
  id: string;
  address: Address;
}

export type AddressOverrides = Partial<Address>;

export function buildAddress(overrides?: AddressOverrides): Address {
  const base: Address = {
    street: "1 Main Street",
    city: "Springfield",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type UserOverrides = Partial<User>;

export function buildUser(overrides?: UserOverrides): User {
  const base: User = {
    id: "user-1",
    address: buildAddress(),
  };
  return overrides ? { ...base, ...overrides } : base;
}
```

Override a nested object with a complete value from its own builder, rather than passing a partial nested object:

```ts
const user = buildUser({
  address: buildAddress({ city: "Chicago" }),
});
```

Invalid nested data composes through the per-type invalidators. The nested invalidator produces `unknown`, which the parent invalidator accepts as corruption; no cast or specialized invalid mock is needed:

```ts
const invalidAddress: unknown = invalidateAddress({ city: null });
const invalidUser: unknown = invalidateUser({ address: invalidAddress });
```

### Missing-field corruption

To test a missing required field, rest-destructure the builder output — honestly typed as `Omit<MyObject, "foo">`, fed to the guard as `unknown`:

```ts
const { foo: _omit, ...missingFoo } = buildMyObject();
```

## Invalidators — corruption, typed `unknown`

One invalidator per owned object type, composing its builder for the valid baseline. Keys are checked (`keyof T`); values are unrestricted; the return is `unknown`, so **no cast is ever needed** at the call site.

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
assert(!isMyObject(invalidateMyObject({ foo: null })));
assert(!isMyObject(invalidateMyObject({ bar: 42 })));
```

Runtime type safety is never bypassed anywhere, **including the invalidator**. It returns `unknown` — the honest type for untrusted runtime data — and only the runtime guard classifies it. Builders always produce valid objects; corruption lives only in invalidators. Do not create generic or shared invalidators (`invalidate<T>`); each is per-type, in this file.

## Function mocks — the production function, nothing else

`mockFunctionName` **is** an implementation of `FunctionName`: identical signature, identical return type, zero extra parameters. It returns built defaults.

```ts
export const mockFunctionName: FunctionName = async (deps, params, payload) => {
  return buildFunctionNameSuccessReturn();
};
```

A test needing different behavior does not configure the mock — it declares its own production-typed function inside the test, composed from builders:

```ts
const failingFn: FunctionName = async () => buildFunctionNameErrorReturn();
```

Forbidden — configuration surfaces in every form:

```ts
mockFunctionName(options?: { result?; handler? })   // options bag
createFunctionNameMock(...): { fn; calls }          // harness bundle
mockFunctionName(result: FunctionNameReturn)        // parameterized factory
```

No call-recording in mocks — no `calls` arrays, counters, captured args, `.mock` properties, or `reset()` methods. The test framework's spy facility wraps any function and records invocations; recording is applied by the test author at the call site, never baked into the mock.

## Classes — decompose, never mock the class

A class breaks all three mechanisms above. Spreading an instance returns a plain object with no prototype, so the builder's override spread destroys the very thing it was meant to produce; the invalidator's spread destroys it the same way; and a class carrying `private` or `protected` members is nominal, so no object literal can inhabit it without a cast, which [types](types.md) forbids.

So **there is no class mock and no constructor mock.** A class decomposes into symbols the rules above already cover. Ask one question: **who constructs it in production?**

### Injected at the composition root → mock the interface, never the class

Adapters, clients, and services are constructed at the application boundary and injected (see [dependency-injection](dependency-injection.md)). The dep's type is the interface the class implements — the class name never appears in a signature, so nothing about the class is ever mocked. That interface is an owned object type: it takes the ordinary builder and invalidator, and each method property defaults to this file's function mock for that method, exactly as a nested object property defaults to its own builder.

Each method's function type is **named in the interface**; an inline function type at a property is an inline type definition (see [types](types.md)).

```ts
export interface LoggerAdapter {
  warn: LoggerAdapterWarn;
  error: LoggerAdapterError;
}
```

```ts
export type LoggerAdapterOverrides = Partial<LoggerAdapter>;

export function buildLoggerAdapter(overrides?: LoggerAdapterOverrides): LoggerAdapter {
  const base: LoggerAdapter = {
    warn: mockLoggerAdapterWarn,
    error: mockLoggerAdapterError,
  };
  return overrides ? { ...base, ...overrides } : base;
}
```

An external class reaches this rule already resolved: DI mandates a repo-owned adapter interface for every external dependency, and external services are never mocked (see *Ownership* above). You mock the adapter interface, never the vendor's class.

### Constructed by the code itself → build a real instance

Errors, value objects, and domain entities are constructed by the code under test, not injected. The mock returns a **real instance**, and the override surface moves from the instance to the constructor:

- the constructor takes exactly **one typed params object**, owned by the interface — the same discipline `deps` / `params` / `payload` imposes on functions (see [composition](composition.md));
- that params type is an ordinary owned object type and takes the full four symbols;
- `buildClassName` accepts the params overrides, composes the params builder, and returns `new ClassName(...)` — prototype intact, private members real, `instanceof` true, no spread, no cast.

```ts
export interface CompressionKeyConstructorParams {
  bucket: string;
  documentKey: string;
}
```

```ts
export type CompressionKeyConstructorParamsOverrides =
  Partial<CompressionKeyConstructorParams>;

export function buildCompressionKeyConstructorParams(
  overrides?: CompressionKeyConstructorParamsOverrides,
): CompressionKeyConstructorParams {
  const base: CompressionKeyConstructorParams = {
    bucket: "documents",
    documentKey: "doc-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type CompressionKeyConstructorParamsCorruptions = {
  [K in keyof CompressionKeyConstructorParams]?: unknown;
};

export function invalidateCompressionKeyConstructorParams(
  corruptions: CompressionKeyConstructorParamsCorruptions,
): unknown {
  return { ...buildCompressionKeyConstructorParams(), ...corruptions };
}

export function buildCompressionKey(
  overrides?: CompressionKeyConstructorParamsOverrides,
): CompressionKey {
  return new CompressionKey(buildCompressionKeyConstructorParams(overrides));
}
```

**There is no `invalidateCompressionKey`.** Corrupt data cannot exist as an instance — the constructor either accepted the params or rejected them. Corruption belongs where untrusted data actually enters, which is the constructor params, and `invalidateCompressionKeyConstructorParams` is its invalidator.

**There is no `mockCompressionKey`.** If a call site must defer construction, the seam is a named factory function type declared in the interface — already a function, already covered above: `mockCreateCompressionKey` returns `buildCompressionKey()`. `new` then appears only in the adapter or the composition root.

### Naming — per owned class

`buildClassName`, plus the four standard symbols on `ClassNameConstructorParams` (`ClassNameConstructorParamsOverrides`, `buildClassNameConstructorParams`, `ClassNameConstructorParamsCorruptions`, `invalidateClassNameConstructorParams`). Do not invent `ClassNameOverrides`, `invalidateClassName`, or `mockClassName`.

### Forbidden — class-specific

spreading a class instance in a builder or invalidator (`{ ...instance, ...overrides }` returns a prototype-less object, not the type it claims) · casting an object literal to a class type to satisfy `private` members · typing a dep by the class instead of the interface it implements · a constructor taking positional arguments instead of one typed params object · a builder that returns a hand-rolled object in place of a real instance.

## Litmus

Every export in the mock file is typed by a name from the interface file — builders return production object types, invalidators return `unknown`, function mocks are production function types. Any export whose type had to be invented is not a mock of this interface; it is new machinery, and new machinery is forbidden.

## Precedence

This topic outranks the workplan. If a node step instructs a null/undefined-accepting builder, a configurable mock factory, a call-recording mock, or a `createXMock` bundle, the step is defective — build the compliant symbols and report the discrepancy in your final report. Do not implement the defective step; do not silently ignore it.

## Residual limitation — exactOptionalPropertyTypes

`Partial<T>` overrides admit explicit `undefined`: `buildMyObject({ foo: undefined })` type-checks and clobbers a required field. Full enforcement requires `exactOptionalPropertyTypes`, deferred repo-wide. Interim convention: callers omit properties rather than pass `undefined`. Enabling EOPT makes the violation a compile error.

## Forbidden (summary)

modify or widen production types · invent shapes or type names · `as` · `satisfies` · overloads · type aliases that weaken checking · generic merge helpers · specialized mock variants instead of overrides · wrap one mock with another · duplicate builders · mock imported symbols / databases / repositories / external services · generic or shared invalidators · spread a class instance · cast an object literal to a class type · type a dep by a class instead of the interface it implements · a positional-argument constructor · a class instance invalidator or a constructor mock.

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

