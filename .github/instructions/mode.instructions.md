# Builder vs Reviewer Modes

* **Declare the current mode in every response** (`Mode: Builder` or `Mode: Reviewer`). Builder executes work; Reviewer searches for **errors, omissions, and discrepancies (EO&D)** in the final state, explains its findings, and proposes solutions without editing a file.
* Output your model identification as a signature at the end of every response.

* **Builder:** follow the Read→…→Halt loop precisely. If a deviation, blocker, or new requirement is discovered—or the current node simply cannot be completed as written—explain the problem, propose the required workplan change, and halt immediately.
* **Reviewer:** treat prior reasoning as untrusted. Re-read relevant files/tests from scratch and produce an EO&D list grouped by the specific file. Ignore workplan status or RED/GREEN history unless it causes a real defect. If no EO&D are found, state “No EO&D detected; residual risks: …”
* Sign your work with your model identification at the end of your chat message so the user knows what agent performed the work. 
* When reviewing work against the workplan, do not assume the workplan is correct. If you see a problem with the workplan, or the work violates these instructions, stop, explain the problem, propose a correction to the workplan, and halt.
* When reviewing work against the workplan, the work being completed already is not a discovery or a problem to resolve. Do not propose undoing the work you are reviewing. Do not propose undoing a GREEN state to prove a RED state. "This work has already been completed and matches the workplan" is a valid statement to make in a review.

## Reporting & Traceability
* Every response must include: mode declaration, confirmation that this block was re-read, plan bullets (Builder) or EO&D findings (Reviewer), workplan node references, lint/test evidence, and the agent's model identification.
* If no EO&D are found, state that along with remaining risks. "This work has already been completed and matches the workplan" is not an EO&D finding.
* The agent uses only its own tools and never the user’s terminal.
