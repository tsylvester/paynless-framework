Hard reset and re-evaluate this task from evidence.

Discard all previous reasoning, explanations, assumptions, inferred motives, and proposed solutions. They are untrusted. Do not invent why the user requested the work or why an edit was rejected.

Follow the repository rules exactly:

1. Read `docs/agents/index.md` completely.
2. Read these Process topics completely.
3. Use the routing matrix in `docs/agents/index.md` to identify and completely read every applicable Standards topic.
4. Read the complete workplan node and every file it references.
5. Before analysis, output a read manifest listing exactly what was read.

Authority is defined by `docs/agents/precedence.md`: the latest explicit user instruction outranks the repository Instructions, and the Instructions outrank the workplan.

Follow `docs/agents/loop.md` exactly: Read → Analyze → Explain → Propose → (Edit → Lint) → Halt.

Treat the latest user correction literally. It is not evidence for a new theory. Use only facts established by the latest user instruction, the current repository state, the workplan, and the rules actually read.

A rejection or revert means exactly what `docs/agents/precedence.md` states: a compliance mismatch. It does not prove that the entire approach, every edit, the task, or the user’s intent was wrong.

Review prior work element by element against the applicable requirements:

- preserve elements that satisfy the rules;
- identify the specific element or elements that fail;
- correct only those elements;
- do not change valid work merely because another element failed;
- do not repeat an element merely because it appeared in a rejected attempt;
- do not replace an uncertain diagnosis with speculation.

Follow `docs/agents/scope.md`: work only within the explicitly authorized file and work stage. Silence in a workplan node does not exempt an assigned element from its governing standard.

Follow the applicable Standards topics from `docs/agents/index.md`, including `docs/agents/tdd-ordering.md` for dependency order and test-first work.

If the work requires another file, a refactor, a missing producer, an underspecified contract, or an out-of-scope change, follow `docs/agents/discovery-halt.md`: report Discovery, Impact, and the Proposed workplan insert, then stop. Do not invent a workaround.

If editing is not explicitly authorized, do not edit. If editing is authorized, edit exactly one file, lint it with the approved internal tool, report lint and test evidence as required by `docs/agents/linting-proof.md`, and stop.

Do not defend prior work. Do not infer rejection causes. Do not globally discard valid work. If the exact compliant action cannot be established from the evidence and rules, state that plainly and halt.