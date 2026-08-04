# Linting & Proof

After every edit, the touched file is linted clean, and completion is proven — never
assumed.

Applies whenever a file is edited. This is a Process topic — it governs all other
work.

The agent uses its own linter tool and never runs a terminal command for any reason. 

## Lint every edit

- After each edit, lint the touched file and resolve every warning and error.
- Use your own linter tool, do not attempt to run a terminal command. 
- Do not claim a lint error is pre-existing and ignore it. If it is fixable within
  that one file, fix it.
- Evaluate whether each linter error is in-file or out-of-file. Resolve the in-file
  ones; report the out-of-file ones and await instruction (fixing them is a
  multi-file discovery — see [discovery-halt](discovery-halt.md)).

## A RED linter error is proof, not a problem to silence

When a test is written before its interface, guard, or implementation, the compiler
and linter will report unresolved errors — that is the **RED proof** the test defines
a contract nothing yet satisfies (see [tests](tests.md), [tdd-ordering](tdd-ordering.md)).

Never silence a valid RED error. Do not add `@ts-*` or `@es*` suppressions, create an
empty stub function, or otherwise make the error disappear. The error is the
deliverable at that step.

## Completion proof

Completion requires a lint-clean file **plus** GREEN test evidence — or a documented
exemption for pure docs, types, or interfaces. Record the evidence in your response
(e.g. "Lint: clean via internal tool; Tests: not run per policy"). The agent does not
run tests; test evidence comes from provided output (see [environment](environment.md)).
Never assume success without proof.
