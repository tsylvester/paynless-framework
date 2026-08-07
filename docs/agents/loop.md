# Work Loop

The fixed cycle every turn follows: **Read → Analyze → Explain → Propose →
(Edit → Lint) → Halt.**

Applies to every turn, every file, both views. This is a Process topic — it governs
all other work.

## The cycle

- **Read** — re-read the Instructions topics relevant to the work, then read every
  referenced or implied file (types, interfaces, helpers) from disk immediately
  before acting. Do not work from memory of a file's contents.
- **Analyze** — determine the gap between the current state and the target, and the
  dependencies involved.
- **Explain** — state the delta in bullets.
- **Propose** — restate the exact edit you will make and commit to it: "I will
  implement exactly this plan now," naming the workplan node it fulfils.
- **(Edit → Lint)** — parenthetical because you may edit **only** if explicitly told
  to edit a file. If you edit, edit exactly one file, then lint it (see
  [linting-proof](linting-proof.md)).
- **Halt** — stop and wait.

If you were **not** told to edit, the cycle is Read → Analyze → Explain → Propose →
Halt. Do not edit.

## Read before you reason

Read is a gate, not a gesture. Before you reason toward **any** solution, you must have
read:

- every Instructions topic your element's row in the [routing matrix](index.md) names —
  "read the rules" means all of them, not just the first file you opened;
- the workplan node, in full;
- every existing file the node references, from disk.

Produce a **read manifest** first — a short list of exactly what you read — and only then
analyze. Reasoning toward a solution before the manifest is a skipped Read: the reasoning
is spent against rules you have not seen and files you have not opened, and is discarded
along with the effort that produced it.

**Read canary.** If your first substantive output reasons toward or proposes a solution
instead of listing what you read, you skipped the Read — the output is invalid (see
[traceability](traceability.md)).

## Execute in the node's order

The node's step order **is** the execution order — you do not choose it, re-plan it, or
reorder it. Do the next unstarted step, then halt (one file per turn, below). "Write the
implementation now, the rest later" reorders the node and is invalid; follow the fixed
order (see [tdd-ordering](tdd-ordering.md)). If the next step genuinely cannot be done in
sequence, that is a discovery — report and halt (see [discovery-halt](discovery-halt.md)) —
never a licence to skip ahead.

## One file per turn

This is the turn-level enforcement of a boundary [scope](scope.md) owns; that topic
defines what the boundary is and what it does not bound.

- Edit exactly one file per turn. Never touch a file you were not explicitly
  instructed to modify.
- After editing, the file's exact change is already confirmed by the edit result —
  do not re-read to "verify."
- Halt after linting that one file and wait. The user will tell you what to do next. 

One file does not mean part of a file. The rule bounds *how many* files you touch, never
*how completely* you finish the one you were given — a half-done element is not a smaller
scope, it is an unfinished one (see [scope](scope.md)).

## Dependencies mean halt, not expansion

If the work needs more than one file, or reaches beyond the file you were told to
touch, that is a discovery — stop and report, do not expand the edit (see
[discovery-halt](discovery-halt.md)). Even reasoning toward a multi-file workaround
is the discovery.

## Searching for files

Do not assume paths or file names. Search with the information you have and narrow
from there. If a search finds nothing, **loosen** the parameters — do not narrow
them further.

Search on what a thing structurally **is**, never on what convention says it would be
called or where it would live — the procedure and its outcomes are owned by
[tdd-ordering](tdd-ordering.md#search-the-invariant-never-the-convention).
