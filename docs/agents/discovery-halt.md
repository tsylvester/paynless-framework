# Discovery & Halt

When the work as scoped cannot be completed within the current file without crossing
a boundary, the agent stops, reports, proposes, and waits. Halting with a clear
report is a **successful** outcome, not a failure.

Applies to every turn, every file, both views. This is a Process topic — it governs
all other work.

## What triggers a halt

Every trigger below is the same event: the work has reached the edge of its scope (see
[scope](scope.md)). Stop the moment any of these appears:

- The required change spans more than one file, or needs an implicit refactor.
- A dependency is missing — a type, guard, mock, test, or source that should already
  exist does not (see [tdd-ordering](tdd-ordering.md) for locate-before-create).
- A function must be refactored to proceed — it is too long, too complex, deeply
  nested, or does not use DI (see [dependency-injection](dependency-injection.md)).
- The contract is underspecified, or a requirement is misstated by the workplan.
- Completing the task appears to require touching a file you were not told to touch.

### What is not a halt trigger

Finishing the element you were given is never one of these, however much of it the node
left unstated. A symbol the node did not name, a slot it did not mention, a case it did not
enumerate — these are inside your scope, and completing them is the work, not an expansion
of it (see [scope](scope.md)). Halting there stops for permission you already have.

The line is the boundary, not the effort. Reaching past the file, the node, or the element
is a halt. Doing all of the element is not.

## The discovery report

Produce a report with three parts and then halt:

- **Discovery** — what you found, grounded in the actual files.
- **Impact** — the dependent files and the minimal workplan additions required.
- **Proposed workplan insert** — the new node(s), in the exact node structure (see
  [workplan-structure](workplan-structure.md)).

Then wait for explicit permission. Do not attempt the multi-file edit, the implicit
refactor, or the out-of-scope touch on your own.

The permission you are waiting for is **for the boundary crossing** — the second file, the
refactor, the node insert. It is never permission to follow a rule you have already read
(see [scope](scope.md#infill-and-report--never-ask-permission-to-comply)).

## The report proposes compliance, never a choice between violations

A halt report names **the compliant action** and the boundary that blocks it. It does not
present the user with options, and it never presents an option that violates a topic — not
as a question, not as an alternative, not as "or I could."

**Every prohibition in this instruction set is paired with a prescription.**
[guards](guards.md) forbids re-authoring a foreign guard **and** gives the four-step
predicate search and the halt that follows it. [mocks](mocks.md) forbids mocking an
imported symbol **and** says to locate the builder in its home package.
[types](types.md) forbids minting a union inline **and** says to propose the node that
declares it in its owning interface. There is no rule here that only forbids.

So a prohibition is never the end of your analysis. If you have found the rule that blocks
your plan and not the rule that replaces it, you have stopped reading one paragraph early —
go back to the same topic and finish it.

**If every option you can see violates a topic, that is the proof you are still routing
around the rule rather than reading forward from it.** The compliant action exists; you
have not found it yet. Asking which violation to commit is not a discovery report — it
converts your unfinished reading into a decision for the user, who then hands you back the
topic you already had.

Worked example. The guard test needs `buildFoo`; the only `buildFoo` you can find lives
outside `Foo`'s owning interface.

> **Wrong** — "I'm not supposed to import a mock from anywhere but the owning interface,
> and the only one I can find is elsewhere. Should I import it anyway, or write one inline
> here?" Both options violate [mocks](mocks.md), and the report asks the user to pick one.

> **Right** — *Discovery:* `foo.mock.ts` exports no `buildFoo`; the only builder of that
> name lives in an unrelated package. *Impact:* `foo.mock.ts` must export the four symbols
> for `Foo` before this guard test can consume them. *Proposed insert:* the node adding
> them.

Nothing in the right-hand version is a question. It is the prescribed action, the file that
blocks it, and the node that unblocks it.

**Halt-report canary.** A report that asks which non-compliant option to take, that offers
the user an option violating a topic, or that names no compliant action at all, is
discarded (see [traceability](traceability.md)). All three are checkable at a glance, and
all three prove the topic was read for permission rather than for instruction.

## Halting is the successful outcome

A correct halt with a complete report **is** the completed task. Producing a
compiling, plausible result by working around the boundary is the failed task — even
if it passes. When a topic says "report and halt," reaching that report is success,
not a dead end.

## Do not ruminate on workarounds

Even *thinking about* how to get around the one-file boundary is itself the
discovery. The instant you find yourself reasoning toward a workaround, stop and
report — do not develop the workaround first.

If you are corrected or realize you deviated, stop, report it, and wait for
direction. Do not self-remediate in a way that risks a further violation; repeated
correction means halt immediately (see [precedence](precedence.md)).
