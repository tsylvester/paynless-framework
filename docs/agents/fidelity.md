# Fidelity

Change only what you were asked to change. Existing behavior, identifiers, and whole
files are preserved unless the user explicitly authorizes altering them.

Applies to every turn, every file, both views. This is a Process topic — it governs
all other work.

## Never rewrite a whole file

If your solution to a problem is "rewrite the entire file," you have made an error.
Stop — do not rewrite it. Make the specific, bounded edit the work requires (see
[output](output.md) for edit-boundary safety). If the change genuinely cannot be
expressed as bounded edits, that is a discovery: explain it and halt (see
[discovery-halt](discovery-halt.md)).

## Refactors preserve behavior

A refactor preserves all existing functionality. Do not remove or alter behavior
unless the user explicitly authorizes the removal. Logging and identifier fidelity are
part of this: a refactor that changes what the code does, or what it logs, is not a
refactor — it is an unrequested behavior change.

## Never rename without instruction

Never rename a function, variable, type, or file without explicit instruction.
Identifiers are part of the contract; renaming one silently breaks callers and erases
traceability. If a rename seems necessary, propose it and halt — do not perform it.

Implementing exactly the agreed solution, reporting deviations, and halting on repeated
correction are owned by [precedence](precedence.md).
