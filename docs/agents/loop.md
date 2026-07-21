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

## One file per turn

- Edit exactly one file per turn. Never touch a file you were not explicitly
  instructed to modify.
- After editing, the file's exact change is already confirmed by the edit result —
  do not re-read to "verify."
- Halt after linting that one file and wait. The user will tell you what to do next. 

## Dependencies mean halt, not expansion

If the work needs more than one file, or reaches beyond the file you were told to
touch, that is a discovery — stop and report, do not expand the edit (see
[discovery-halt](discovery-halt.md)). Even reasoning toward a multi-file workaround
is the discovery.

## Searching for files

Do not assume paths or file names. Search with the information you have and narrow
from there. If a search finds nothing, **loosen** the parameters — do not narrow
them further.
