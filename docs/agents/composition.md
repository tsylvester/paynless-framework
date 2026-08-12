# Composition

Every exported function has a defined signature built from four typed objects and a discriminated-union return. This topic owns the **shape** of that signature.

Cited by: construction view (workplan node `interface` and `implementation` elements) and implementation view (interface prompt, implement prompt). Governed by all Process topics.

## The signature

The payload slot has two forms, chosen by the function's role; deps and params never vary between them.

```ts
// TRUSTED form — payload arrives already narrowed, from an in-TS caller
myFunction: MyFunctionFn {
  deps:    MyFunctionDeps
  params:  MyFunctionParams
  payload: MyFunctionPayload
}: MyFunctionReturn = MyFunctionSuccessReturn | MyFunctionErrorReturn

// VALIDATING form — payload arrives as untrusted data from a runtime boundary
// (queue, JSON, API, DB row). Typed `unknown`, guarded on the first line, narrowed
// to MyFunctionPayload for the whole body. Mechanics: guards.md#guard-on-entry.
myFunction: MyFunctionFn {
  deps:    MyFunctionDeps
  params:  MyFunctionParams
  payload: unknown
}: MyFunctionReturn = MyFunctionSuccessReturn | MyFunctionErrorReturn
```

- a defined function name
- a signature type ending in `Fn`
- a typed `deps` object — injected collaborators
- a typed `params` object — per-invocation control values
- a typed `payload` object — the data the function operates on; typed `unknown` in the validating form (see [parameter jurisdiction](#parameter-jurisdiction--what-is-trusted-vs-proven))
- a return that is a discriminated union of a named success and a named error

Rules:

- **Deps are never placed in params.** Do not blob `params` and `payload`, and do not invent other objects to define the function.
- **Supply every element**, even one the function does not use *right now*. The slot is part of the contract, not an optimization.
- **The return is always the union.** "This function only ever succeeds, so it returns only the success type" is not the author's call. The union is deliberate. See [errors-and-returns](errors-and-returns.md) for how the union is handled; this topic owns only its shape.
- **One function per file, one file per function.** Tempted to add a second function to a file → stop, report, propose the node, halt (see [discovery-halt](discovery-halt.md)).

## Classes — two admitted roles, and how the signature maps

"One function per file" governs **exported standalone functions**. A class holding several methods is not an exception to that rule and not a way around it; it is a different kind of symbol, admitted in exactly two roles:

1. **An adapter at the boundary** — it implements a repo-owned interface and wraps an external dependency, so the rest of the repo depends on the interface rather than the vendor (see [dependency-injection](dependency-injection.md)).
2. **An owned value or error type** the code constructs — a domain entity, a value object, a typed error.

Anything that is neither is a function, and takes the signature above. Tempted to write a class for a third reason → stop, report, propose the node, halt.

**One class per file, one file per class** — the same rule, one level up. A class file hosts no standalone exported functions beside the class.

The four-slot signature maps onto an adapter without changing:

- the **constructor** takes the deps slot, as one typed constructor-params object — its collaborators and configuration, supplied once at the composition root, never per call;
- each **method** takes its own named `params` and `payload` types and returns its own `Success | Error` union, exactly as a standalone function does.

A method is the adapter's surface, not an independent exported function, so it does not claim a file of its own — but every method's function type is **named in the interface** (an inline function type at a property is an inline type definition; see [types](types.md)). A value or error class declares only the constructor-params object; its members follow [types](types.md) and, for errors, [errors-and-returns](errors-and-returns.md).

How each role is mocked is owned by [mocks](mocks.md#classes--decompose-never-mock-the-class); how each is guarded is owned by [guards](guards.md#classes--instanceof-for-owned-classes-shape-for-their-params).

## Everything constructed or emitted is fully typed and composable

Any object the function constructs or emits has a defined type. If the type is nested, every layer is defined, typed, and composable, recursing until a primitive is reached:

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

Emitting an untyped object is prohibited. Even primitives are typed so the receiving function knows exactly what it is given. Any object passed into the function must have a type defined in the interface of its owner (wherever the object originates). See [types](types.md) for locating and narrowing types.

### Which shapes this interface owns

The signature is not the whole surface. A function also builds objects on the way to its return, and those need types as much as the return does. The interface declares them — which means deciding, per object, whether this interface owns its type at all.

Two questions, in order:

1. **Does a named type already describe this shape?** Locate before you create (see [tdd-ordering](tdd-ordering.md)). If one exists, use it; it belongs to whoever declared it, and this interface declares nothing.
2. **Did this function originate the shape?** Only then does this interface own it.

What originates a shape: the success and error arms and their flavors; an intermediate assembled during the operation whose shape no named type describes; a value derived from an input that is a **different shape** from that input.

### Two things that are not construction

**Modifying an object you were handed.** A function that receives a `PipelineObject`, changes it, and returns or passes it on is still working with a `PipelineObject` — same shape, same type, same owner, nothing to declare here. The discriminator is the shape, not the values in it: changing what a field holds does not produce a new kind of thing. Only a genuinely different shape does.

**Building a value for a collaborator.** A dependency's signature already declares its own `params` and `payload` types, so a function assembling one is constructing a *value* of a type that dependency's interface owns — not a new type of its own. The type lives with the receiver, not the builder.

If the dependency declares no type for what it receives, that is a defect in **that** interface. Report it and halt (see [discovery-halt](discovery-halt.md)). Declaring the missing type here puts it in the wrong file, where the owner cannot maintain it and every other caller will mint its own.

**Resolve this at the interface, not in the body.** An object first noticed while writing the implementation is a type discovered at the worst moment — the element that should have declared it is closed, and the quick exits are all prohibited: typing it inline, widening it to `unknown`, or minting a union at the use site (see [types](types.md)). The node's `interaction.spec` (see [workplan-structure](workplan-structure.md)) states per branch what is decided, called, and returned, which is where these objects are visible while the interface is still open.

## Parameter jurisdiction — what is trusted vs. proven

The three parameters differ by where their values come from, which decides how they are typed:

- **`deps`** — constructed in trusted TypeScript by the composition root, never serialized. Typed strong, never `unknown`, never guarded at entry. Typing deps `unknown` would blind the compiler where it is competent and break DI. See [dependency-injection](dependency-injection.md).
- **`params`** — assembled by the caller in-TS from already-narrowed values. Typed strong. A field that provably originates from outside the type system is payload-natured and belongs in `payload`.
- **`payload`** — the data the function operates on. When it arrives from a runtime boundary (queue, JSON, external) and the function validates it, the parameter is typed `unknown` and guarded on the first line. See [guards](guards.md#guard-on-entry-validating-functions-take-unknown).

The rule the agent cannot fumble: **does this value arrive as data from outside the type system?** Yes → `unknown` + guard. No → strong type, trust it.

### The validating form — what changes, what does not

`payload: unknown` is the entry annotation only, and only for the one function that validates untrusted input. Four things follow; none is optional.

- **The payload type is not retired — it is the guard's target.** `MyFunctionPayload` is still defined in the interface, guarded by `isMyFunctionPayload`, built by the mock, and exercised by the guard test. The first line narrows `unknown` back to `MyFunctionPayload` and the whole body runs on the strong type. `unknown` never means "no payload type" — it means the type is proven at entry instead of assumed.
- **Guard once, at the boundary; downstream trusts.** Only the validating function takes `unknown`. Every function it calls receives the already-narrowed `MyFunctionPayload` in the trusted form. The same payload is `unknown` in the boundary signature and `MyFunctionPayload` everywhere downstream — do not spread `unknown` inward, and do not re-guard what the boundary already proved.
- **A failed guard returns the error arm — it never throws.** `if (!isMyFunctionPayload(payload)) return <MyFunctionErrorReturn>`. This is why the return is always the union (a validating function structurally always has a failure arm) and why the boundary is pulled inside the function: the error becomes a handled return value, not an exception leaked to a caller who cannot catch it. See [errors-and-returns](errors-and-returns.md).
- **The payload contract is proven by the unit and guard tests, not the interface test.** `Parameters<MyFunctionFn>[payload]` is `unknown`, so an interface-test assignment to it proves nothing — everything is assignable to `unknown`. "Rejects an invalid payload with an error return" is a unit test over an `invalidate`d payload, backed by the guard test. See [tests](tests.md).

Deps and params never take this form. A params field that originates outside the type system is payload-natured and moves to payload; params itself is never `unknown`.

## Precedence

This topic outranks the workplan. A node step that puts deps inside params, blobs params and payload, returns only the success type, hosts two functions in one file, types an untrusted payload strong instead of `unknown` + guard, or throws on an invalid payload instead of returning the error arm is defective — comply with this topic and report the discrepancy.

