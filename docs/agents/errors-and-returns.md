# Errors and Returns

A function returns a member of its `SuccessReturn | ErrorReturn` union, and every error is surfaced intact. This topic owns error **handling** and return **consumption**; [composition](composition.md) owns the union's shape.

Cited by: construction view (workplan node `interface` and `implementation` elements) and implementation view (interface prompt, implement prompt, unitTest prompt). Governed by all Process topics.

## Errors are typed

- Errors are explicitly typed. You know which errors a function can produce — do not guess the error kind with a ternary.
- Each error is a single, specific failure.
- Each error explains exactly what went wrong and exactly where.
- The error arm is typed as that union of specific errors, never as a bare `Error` class. An arm that names only `Error` forces every consumer to recover the failure kind by parsing a message; that reconstruction is a defect in this function's contract, not a quirk of the consumer.

## Errors are surfaced, never altered

- Every error is surfaced, every single time.
- Errors are never swallowed, never stored, never converted, coerced, or modified.
- You get an error, you pass the error along — unchanged. Surface it so it can be fixed; do not hide it or reshape it.

## Which error does a function return?

When a function hits a failure, classify it:

1. A dependency or callee already returned a **typed error** → propagate it unchanged. Never convert, coerce, or re-wrap it.
2. The failure is **this function's own** — a validation failure, a violated precondition → return a **new, specific typed error this function owns**, naming exactly what failed and where.

There is no third option. You never convert one error type into another, and you never invent an untyped or generic error to stand in for a specific one.

## The return is always the union

- The function returns a member of `SuccessReturn | ErrorReturn`. "This function only ever succeeds" is not the author's call — the error arm exists on purpose.
- The payload is the data the function operates on; the return is always the Success-or-Error union. The two are distinct and both are always present in the contract.
- Callers narrow the return by its discriminant and handle both arms. A caller that reads only the success arm has dropped an error path.

## Either arm may be a union of flavors

The top-level return always has **exactly two arms**: `SuccessReturn | ErrorReturn`. Never three, never one. But either arm may itself be a union of discrete members when that outcome has more than one discrete flavor. The flavors nest **inside** the arm; they are members of `SuccessReturn` (or `ErrorReturn`), never siblings of it.

```ts
MyFunctionReturn = MyFunctionSuccessReturn | MyFunctionErrorReturn   // always two arms

MyFunctionSuccessReturn =
  | ArtifactFoundReturn   // success: an existing compression artifact was returned
  | EnqueuedReturn        // success: no artifact found, a compress job was enqueued

MyFunctionErrorReturn =
  | ValidationError
  | EnqueueError
```

Both `ArtifactFoundReturn` and `EnqueuedReturn` are successes — the operation did what it should. They differ only in *which* successful outcome occurred, so they are members of `MyFunctionSuccessReturn`. (The enqueued case is one illustration; any success or error condition with several discrete outcomes takes the same shape.)

```ts
// FORBIDDEN — hoisting a success flavor to sit beside Success and Error
MyFunctionReturn = MyFunctionSuccessReturn | EnqueuedReturn | MyFunctionErrorReturn
```

`EnqueuedReturn` is a member of `MyFunctionSuccessReturn`, not a peer of it. Hoisting it breaks the two-arm invariant: a caller must be able to answer "did this succeed?" by discriminating the two arms **without** enumerating every flavor, then discriminate the flavor *within* the arm. A three-plus-arm top-level union forces every consumer to know every flavor just to decide success from failure.

Membership is transitive — `EnqueuedReturn` is assignable to `MyFunctionSuccessReturn` is assignable to `MyFunctionReturn` — and is proven by typed assignment in the interface test (see [tests](tests.md#interface)).

### Every flavor carries the state its outcome produced

A flavor exists to report which thing happened **and** what that thing produced. A member whose only admissible value is a constant reports nothing: the flavor's name is doing all the work, and the field is a boolean with extra steps. Give each flavor the state its outcome actually yields — the artifact that was found, the job id that was enqueued — so the caller learns the outcome from the type rather than from the name.

The same loss with fewer types is a single success type standing for several distinct outcomes. If the operation can succeed in more than one way, the arm is a union of flavors; collapsing them into one type erases the distinction the caller needs.

"Nothing branches on it, so it needs no content" is not a defense. Nothing branches *because* the type carries nothing to branch on — the defect's own consequence offered as evidence for the design. Callers denied the information do not go without it; they invent string-matching, side-channel reads, or status writes to recover what the type refused to carry.

## Precedence

This topic outranks the workplan. A node step that returns only the success type, hoists a success or error flavor into the top-level union (making it more than two arms), declares a success flavor whose only admissible value is a constant, collapses several distinct outcomes into one success type, types the error arm as a bare error class, swallows or rewrites an error, converts an error to a different type, or leaves an error arm unhandled is defective — comply with this topic and report the discrepancy.

