# Discovery & Halt

When the work as scoped cannot be completed within the current file without crossing
a boundary, the agent stops, reports, proposes, and waits. Halting with a clear
report is a **successful** outcome, not a failure.

Applies to every turn, every file, both views. This is a Process topic — it governs
all other work.

## What triggers a halt

Stop the moment any of these appears:

- The required change spans more than one file, or needs an implicit refactor.
- A dependency is missing — a type, guard, mock, test, or source that should already
  exist does not (see [tdd-ordering](tdd-ordering.md) for locate-before-create).
- A function must be refactored to proceed — it is too long, too complex, deeply
  nested, or does not use DI (see [dependency-injection](dependency-injection.md)).
- The contract is underspecified, or a requirement is misstated by the workplan.
- Completing the task appears to require touching a file you were not told to touch.

## The discovery report

Produce a report with three parts and then halt:

- **Discovery** — what you found, grounded in the actual files.
- **Impact** — the dependent files and the minimal workplan additions required.
- **Proposed workplan insert** — the new node(s), in the exact node structure (see
  [workplan-structure](workplan-structure.md)).

Then wait for explicit permission. Do not attempt the multi-file edit, the implicit
refactor, or the out-of-scope touch on your own.

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
