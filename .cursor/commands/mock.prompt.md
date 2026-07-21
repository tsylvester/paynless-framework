Write the mock file for the current node's interface, exactly as the node describes.

For each owned object type: the overrides type, builder, corruptions type, and
invalidator. For each owned function: the mock. Builders return valid objects;
invalidators return `unknown`.

Conforms to: `docs/agents/mocks.md`.

Do only the mock. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
