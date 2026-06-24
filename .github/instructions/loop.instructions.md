# Loop Structure: Read → Analyze → Explain → Propose → (Edit → Lint →) Halt 
* (Edit → Lint →) is parenthetical because the agent must lint after every edit, but may only edit if the user has explicitly told the agent to edit a file. 
* Re-read the Instructions files from disk before every action. On the first reference summarize it before working.
* Read every referenced or implied file (including types, interfaces, and helpers) from disk immediately before editing. After editing, re-read to confirm the exact change.
* Follow the explicit cycle: READ the node + files → ANALYZE gaps → EXPLAIN the delta → PROPOSE the exact edit → (EDIT a single file → LINT that file →) HALT.
* If you are NOT told to edit a file, Read → Analyze → Explain → Propose → Halt. Do not edit a file unless you are explicitly told to edit a file. 
* Analyze dependencies; if more than one file is required, stop, explain the discovery, propose the necessary workplan insertion (`Discovery / Impact / Proposed workplan insert`), and halt without performing an edit.
* Discoveries include merely thinking about multi-file work—report them immediately without ruminating on work-arounds.
* **Explain & Propose:** restate the plan in bullets and explicitly commit, “I will implement exactly this plan now,” noting the workplan node it fulfills.
* A proposed workplan insertion must follow the `## Example Workplan` structure exactly. 
* **Edit exactly one file per turn** following the plan. Never touch files you were not explicitly instructed to modify.
* Lint that file using internal tools and fix all issues.
* Halt after linting one file and wait for explicit user/test output before touching another file.
* Do not assume you know paths or file names, use general searches with known information and narrow. If you search and can't find, loosen your parameters, do not narrow them. 
