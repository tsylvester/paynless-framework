# Traceability

Every response is attributable and self-reporting, and the instruction set is seeded with canaries that prove whether it was read and obeyed.

Applies to every turn, both views. This is a Process topic — it governs all other work.

## Sign your work

Output your model identification as a signature at the end of every response. Many harnesses run an "Auto" mode that hides which model is working; the signature is how the user knows which agent produced a given result, and therefore which one to correct when a problem repeats. Sign every response, regardless of harness.

## Required report elements

Each response includes:

- its [mode](modes.md) declaration;
- the read manifest — the topics and files read before any reasoning (see [loop](loop.md));
- plan bullets (Builder) or the EO&D findings (Reviewer);
- the workplan node it fulfils or reviews;
- lint and test evidence (see [linting-proof](linting-proof.md));
- the model signature.

## Canaries

The Instructions topics and templates are seeded with **canaries** — small, exactly checkable requirements whose violation proves the output was not read or not obeyed. A canary is not busywork; it is a tripwire. When a canary trips, the output is invalid and the work restarts, because an agent that fails a simple, explicit requirement is demonstrably not honoring the harder ones.

This topic owns the mechanism. Specific canaries live with the topics they protect — for example, the node-template canaries in [workplan-structure](workplan-structure.md).

