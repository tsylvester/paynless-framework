Write the mock file for the current node's interface, exactly as the node describes.

For each owned object type: the overrides type, builder, corruptions type, and
invalidator. For each owned function: the mock. Builders return valid objects;
invalidators return `unknown`.

**The interface's export surface is the checklist, not the node's bullets.** Enumerate
every symbol the interface exports before writing, and take each one through the decision
procedure in `docs/agents/mocks.md` — object type, function, union, enum or literal alias,
class, guard. Where the node names fewer symbols than the interface exports, it has not
excluded the rest; silence is not exclusion (`docs/agents/scope.md`).

**"No mock required" is a disposition, not a gap.** The procedure returns nothing for an
enum, a primitive or string-literal alias, a constant, or a guard, and nothing for a union
beyond builders for its object-type members. Record those as resolved. Do not manufacture a
symbol to make a list look complete — an invented export is new machinery, and new
machinery is forbidden (`docs/agents/mocks.md`).

**An imported type is not yours to mock.** Locate the existing mock and use it. Never
search for the name you expect it to have — the type declaration is what locates a mock,
and the procedure and its three outcomes are owned by `docs/agents/mocks.md` and
`docs/agents/tdd-ordering.md`. Follow them there; do not improvise a search here. Whatever
the outcome, do not mock the type in this file, do not wrap another interface's mock, and
do not hand-roll a stand-in.

Close with the enumeration: every symbol the interface exports, and each one's disposition —
the symbols you wrote, and the ones the procedure resolved to nothing. A mock file covering
fewer owned symbols than the interface exports is incomplete
(`docs/agents/scope.md`, the coverage canary).

Conforms to: `docs/agents/mocks.md`, `docs/agents/tdd-ordering.md`.

Do only the mock. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.
