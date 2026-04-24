---
name: Do not create or edit the interface file when writing an interface test
description: The interfaceTest command prohibits touching the interface file — not just editing implementation, but creating it at all
type: feedback
---

When executing /interfaceTest, the instruction "DO NOT TOUCH THE INTERFACE FILE" means do not create, edit, or write the interface file under any circumstances — even as an empty placeholder. Write only the test file. The interface file is the user's responsibility.

**Why:** Touching the interface file violates the TDD RED boundary. The user explicitly and repeatedly stated this in the command and corrected this violation in conversation.

**How to apply:** When writing an interface test, write exactly one file: the `.interface.test.ts` file. If the interface file does not exist, the linter will complain about a missing module — that is acceptable RED state. Never create the empty interface file as a "placeholder."
