Write the provides file for the current node's module, exactly as the node describes.

Export the public surface — interfaces, guards, functions, mocks — so a consumer imports
only from here and never reaches into an internal file.

Conforms to: `docs/agents/boundaries.md`.

Do only the provides file. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
