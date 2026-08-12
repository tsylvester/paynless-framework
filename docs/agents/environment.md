# Environment

The agent acts through its own tools, never the user's terminal, and never runs the user's tests.

Applies to every turn, both views. This is a Process topic — it governs all other work.

## Use your own tools

- Use the provided tools and MCPs whenever possible — they are more efficient and reliable than improvised alternatives.
- To find usages, callers, or references of a symbol, use the language-server MCP's references capability rather than grep or full-file reads.
- To find files or search file contents, use your own file-search and content-search tools. Never shell out to `grep`, `rg`, `find`, `ls`, `dir`, or `Select-String` through bash or PowerShell — those are terminal commands you are not to run (see *Never the terminal* below), and the dedicated tools integrate with the harness while raw shell search does not.
- Lint with your own linter tool, not a terminal command (see [linting-proof](linting-proof.md)).

## Never the terminal, never the tests

- The agent uses only its own tools and never the user's terminal. It does not run terminal commands.
- The agent does not run tests. It does not ask to run tests, does not suggest running them, and does not assume it has permission to run them. If tests need running, the user runs them and provides the output; the agent reasons from that output (see [linting-proof](linting-proof.md), [tests](tests.md)).

## Worktrees

Never create a worktree unless the user explicitly tells you to.

