# Linting & Proof
* After each edit, lint the touched file and resolve every warning/error. Record lint/test evidence in the response (e.g., “Lint: clean via internal tool; Tests: not run per instructions”).
* Do not claim a lint error is pre-existing and ignore it. If you see a lint error, fix it, as long as it is fixable within that single file.
* Evaluate if a linter error can be resolved in-file, or out-of-file. Only resolve in-file linter errors, then report the out-of-file errors and await instruction.
* TDD may produce unresolvable linter errors if the source has not been written yet. 
* Do not silence valid linter errors with `@ts` or `@es` flags, create an empty target function, or other work-arounds. The linter error is itself proof of the RED state of the test.
* Completion proof requires a lint-clean file plus GREEN test evidence (or documented exemption for types/docs).
