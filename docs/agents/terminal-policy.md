# Terminal policy

Agents are restrained to their internal tools. Terminal command execution is denied by default; a tiny allowlist admits only read-only static analysis that has no internal-tool equivalent. This topic owns the **policy**; enforcement is per-environment (see each environment's terminal-guard adapter).

Cited by: every environment's instruction file and terminal-guard adapter. Governed by all Process topics.

## The two-gate test

A command may run only if it passes **both** gates:

1. **No internal-tool equivalent.** If the agent's own tools (read a file, search, glob, edit, fetch a URL) already do it, the terminal form is denied — it strips the intent guarantees those tools enforce (`cat | grep` bypasses "read this file"; `curl` duplicates the fetch tool without its governed egress).
2. **Read-only.** No mutation, no program execution, no network.

Both gates. Read-only but has an internal equivalent still fails (gate 1). No equivalent but executes or mutates still fails (gate 2).

## By category

**Allowed** (passes both — the proof surface the methodology depends on):

- read-only type-check — e.g. `deno check`, `tsc --noEmit`
- read-only lint — e.g. `deno lint`, `eslint` (no `--fix`), `biome check` (no `--write`)

**Denied, and why:**

- file read/search (`cat`, `head`, `grep`, `find`, `ls`) — gate 1: use Read / Grep / Glob
- web fetch (`curl`, `wget`) — gate 1: use the internal fetch tool
- test / app execution — gate 2: state is proven by the compiler, not by running
- mutation (`git add`/`commit`, `fmt --write`, file writes) — gate 2
- installs (`npm i`, `deno add`) — gate 2: mutation + network + supply chain

## Asymmetry — bias to deny

A false deny is cheap: the agent asks, the user runs it. A false allow is expensive: an intent bypass or an unreviewed mutation. So the allowlist is the smallest set the methodology needs, and everything unlisted is denied.

## The engine (canonical spec)

Each script-hook adapter **inlines** this logic (no shared code file — the spec here is the single source of truth); only the allowlist **data** is shared. A command is allowed if and only if:

- it is non-empty, **and**
- it contains no shell-composition metacharacter — `;` `&` `|` `<` `>` `` ` `` `$` `(` `)` or newline. An allowlisted verb chained to anything (`deno check && rm -rf x`) must not pass, **and**
- it equals an allowlist entry, or begins with an entry followed by a space.

Entries are **literal command prefixes**, not regex — no user-authored pattern footguns. Deny-by-default: an empty allowlist blocks everything. Unreadable input or allowlist → deny (fail closed).

## Enforcement is per-environment

Capability varies; the policy is the portable floor every tool honors as instruction. Adapters, by capability:

- **Script-hook (hard):** Claude Code, Cursor — run the engine, hard-block before the command executes. The allowlist lives once in `.agent/terminal-guard/allowlist.json`.
- **Declarative (coarser):** Codex (sandbox + approval policy), Copilot (deny/allow lists). Cannot run the engine; they approximate the policy in the tool's own config, and the allowlist must be **re-expressed** there in the tool's format.
- **Instruction (soft):** Devin / Windsurf — the policy as a rule the agent reads; no hard block.

Each environment folder documents its own allowlist mechanism and its limits.

## Precedence

This policy outranks the workplan. An agent that runs a denied command, or routes around the guard, is defective — comply, and if a command is genuinely needed, stop and ask the user to run it.

