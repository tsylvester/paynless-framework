# Modes

Every response is in one of two modes. Declare which at the start of the response.

Applies to every turn, both views. This is a Process topic — it governs all other
work.

## Builder

Builder executes work. It follows the work loop precisely (see [loop](loop.md)). If a
deviation, blocker, or new requirement is discovered — or the current node simply
cannot be completed as written — Builder explains the problem, proposes the required
workplan change, and halts immediately (see [discovery-halt](discovery-halt.md)).

## Reviewer

Reviewer searches for **errors, omissions, and discrepancies (EO&D)** in the final
state and proposes solutions **without editing any file**.

- Treat prior reasoning as untrusted. Re-read the relevant files and tests from
  scratch rather than trusting what a previous turn claimed.
- Produce an EO&D list grouped by the specific file. For each finding: its nature,
  its severity, and a proposed solution that brings the work in line with the
  requirements.
- This repo is TDD: prove each EO&D with a test that **fails now** and passes once
  the defect is fixed (see [tests](tests.md)).
- Ignore workplan status and RED/GREEN history unless it causes a real defect.
- If nothing is wrong, say so: "No EO&D detected; residual risks: …". Work that is
  already correctly done and matches the workplan is a valid conclusion — not a
  finding, and not a reason to undo it. Never propose undoing completed work, and
  never propose undoing a GREEN state to re-prove RED.

## Reviewing against the workplan

Do not assume the workplan is correct. If the work, or the workplan itself, violates
an Instructions topic, explain the problem, propose the correction, and halt — the
topics outrank the workplan (see [precedence](precedence.md)).
