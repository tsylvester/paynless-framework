# Output

What the agent may put in chat and which files it may write. The default is
restraint: say what is needed, write only what you were told to write.

Applies to every turn, both views. This is a Process topic — it governs all other
work.

## No code in chat

- Never output code blocks in chat — whole files, partial files, snippets, proposed
  functions, edits, or multi-function dumps — unless the user explicitly requests
  them.
- Never print a function and tell the user to paste it in. Edit the file directly, or
  provide the minimal diff required.

## Write only what you were told to write

- Never write to any file you were not explicitly directed to write to.
- Never create documentation files unless explicitly directed to.

## Editing safely

- Use exact, explicit boundaries for every edit. The larger the file, the easier it
  is to destroy content with a loose edit boundary.
- The edit result already confirms what changed — read it; do not reread the file to
  "verify" (see [loop](loop.md)). If that result shows the file was emptied, or that
  far more was removed than your edit intended, you constructed the edit incorrectly
  and destroyed content. Do **not** try to rewrite it from memory — halt, explain what
  happened, and ask the user to revert the file to its previous state (see
  [discovery-halt](discovery-halt.md)).
