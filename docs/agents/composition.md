# Composition

Every exported function has a defined signature built from four typed objects and
a discriminated-union return. This topic owns the **shape** of that signature.

Cited by: construction view (workplan node `interface` and `implementation`
elements) and implementation view (interface prompt, implement prompt). Governed
by all Process topics.

## The signature

```ts
myFunction: MyFunctionFn {
  deps:    MyFunctionDeps
  params:  MyFunctionParams
  payload: MyFunctionPayload
}: MyFunctionReturn = MyFunctionSuccessReturn | MyFunctionErrorReturn
```

- a defined function name
- a signature type ending in `Fn`
- a typed `deps` object — injected collaborators
- a typed `params` object — per-invocation control values
- a typed `payload` object — the data the function operates on
- a return that is a discriminated union of a named success and a named error

Rules:

- **Deps are never placed in params.** Do not blob `params` and `payload`, and do
  not invent other objects to define the function.
- **Supply every element**, even one the function does not use *right now*. The
  slot is part of the contract, not an optimization.
- **The return is always the union.** "This function only ever succeeds, so it
  returns only the success type" is not the author's call. The union is deliberate.
  See [errors-and-returns](errors-and-returns.md) for how the union is handled;
  this topic owns only its shape.
- **One function per file, one file per function.** Tempted to add a second
  function to a file → stop, report, propose the node, halt (see
  [discovery-halt](discovery-halt.md)).

## Everything emitted is fully typed and composable

Any object the function constructs or emits has a defined type. If the type is
nested, every layer is defined, typed, and composable, recursing until a primitive
is reached:

```ts
ExampleObject = {
  key1: Key1Type
  key2: Key2Type
}

Key1Type = {
  subKeyA: SubKeyA
  subKeyB: SubKeyB
}

Key2Type = SomeOtherThing   // recurses until primitive
```

Emitting an untyped object is prohibited. Even primitives are typed so the
receiving function knows exactly what it is given. Any object passed into the
function must have a type defined in the interface of its owner (wherever the
object originates). See [types](types.md) for locating and narrowing types.

## Parameter jurisdiction — what is trusted vs. proven

The three parameters differ by where their values come from, which decides how
they are typed:

- **`deps`** — constructed in trusted TypeScript by the composition root, never
  serialized. Typed strong, never `unknown`, never guarded at entry. Typing deps
  `unknown` would blind the compiler where it is competent and break DI. See
  [dependency-injection](dependency-injection.md).
- **`params`** — assembled by the caller in-TS from already-narrowed values. Typed
  strong. A field that provably originates from outside the type system is
  payload-natured and belongs in `payload`.
- **`payload`** — the data the function operates on. When it arrives from a runtime
  boundary (queue, JSON, external) and the function validates it, the parameter is
  typed `unknown` and guarded on the first line. See [guards](guards.md#guard-on-entry-validating-functions-take-unknown).

The rule the agent cannot fumble: **does this value arrive as data from outside the
type system?** Yes → `unknown` + guard. No → strong type, trust it.

## Precedence

This topic outranks the workplan. A node step that puts deps inside params, blobs
params and payload, returns only the success type, or hosts two functions in one
file is defective — comply with this topic and report the discrepancy.
