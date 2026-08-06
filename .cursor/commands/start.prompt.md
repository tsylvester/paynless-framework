Begin the work loop against the section of the workplan highlighted in the editor and
attached to this command. That selection is your assignment.

**The selection is the node, and it is the whole scope.**

- The highlighted range delivered with this command is a direct user instruction, not
  ambient editor context. The rule that incidental on-screen state means nothing
  (`docs/agents/precedence.md`) does not apply to it — the user selected it deliberately
  and handed it to you.
- It is the complete and only scope. Do not read workplan content above or below it, do
  not scan the file for a step, and do not treat its last line as a position to continue
  from.
- If the selection is not a complete node — a fragment, or more than one node — report
  that and halt (`docs/agents/discovery-halt.md`). Do not read outward to find a whole
  one.
- "The user's selection includes the first line of the next node" is not a discovery, it is how selecting a section in a markdown file works. Do not report it, do not halt on it, do not reason that the user "must actually want me to read the next node instead". Focus on the entire complete node you were given to read, not the first line of the next node that was incidentally included. DO NOT read the next node "just to check". That is not the task you were given. 

Before you reason about anything, read. This is a gate, not a formality:

1. Read the selection in full. It names the element you are building.
2. Read `docs/agents/index.md`. Find that element's row in the Implementation routing
   matrix, and read every Process topic and every Standards topic that row names. "Read
   the rules" means all of them — not the first file you open.
3. Read every existing file the node references, from disk.

Then produce a **read manifest** — a short list of exactly what you read — before any
analysis. Do not reason toward a solution until that manifest exists
(`docs/agents/loop.md`).

Then, every turn:

- Determine what is unstarted from the **files on disk**, never from the checkboxes. A
  `[✅]` is a claim about state; the file is the fact. Walk the node's elements in order,
  read the files each one names, and judge it against the topics that govern it
  (`docs/agents/linting-proof.md`, `docs/agents/modes.md`). The first element not
  satisfied on disk is your step.
- Where a marker and the disk disagree — ticked but unsatisfied, or unticked but already
  satisfied — report the discrepancy and halt (`docs/agents/discovery-halt.md`). Do not
  silently redo work the plan calls done, and do not silently skip work it calls pending.
  You do not edit node status (`docs/agents/workplan-structure.md`).
- Only when every element in the selection is satisfied **on disk** is the node complete.
  Say so, and give the evidence that establishes it. "The boxes are ticked" is not
  evidence.
- Take that step as the subject of the work loop — Read → Analyze → Explain → Propose →
  (Edit → Lint) → Halt (`docs/agents/loop.md`). Absent an explicit instruction to edit,
  the loop terminates at Propose.
- Do not reorder or merge the node's steps (`docs/agents/tdd-ordering.md`).
- Obey precedence — user, then Instructions topics, then the workplan
  (`docs/agents/precedence.md`). Declare your mode and sign your work
  (`docs/agents/modes.md`, `docs/agents/traceability.md`).

Do not edit any file unless the user explicitly tells you to edit it. Do not output code
in chat.
