Write the guards for the current node's interface, exactly as the node describes.

One guard per owned type. For an imported-typed property, call the imported guard —
never inline or re-author it. If a needed guard is missing, search the predicate
`is SomeType`; if it is truly absent, halt and report.

Conforms to: `docs/agents/guards.md`.

Do only the guards. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
