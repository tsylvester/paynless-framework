State the current scope of work, in full. This command exists so that a scope statement is
never a delta (`docs/agents/scope.md`).

Do no work. This is a statement of where things stand, not a step toward finishing them.

**Assemble the scope from where it was established.** Usually more than one place:

- the workplan, if a node or set of nodes is in play — its elements, in their order;
- this conversation — everything agreed, added, deferred, or withdrawn since the work
  began, including items raised and not yet confirmed;
- the files themselves, for anything whose state is a fact on disk rather than a claim.

Where an item's completion is recorded but not verifiable from what you have read, say so
rather than repeating the claim as fact. A checkbox is not evidence (`docs/agents/scope.md`).

**State every item, with its disposition.** Not the items that changed — every item, whether
or not anything about it moved this turn. Use these dispositions:

- **Done** — complete, with what was produced.
- **Remaining** — still to do, in the order it will be done.
- **In progress** — started and not finished, with what is left.
- **Held** — deliberately deferred, with what it is waiting on.
- **Withdrawn** — dropped, with the reason it no longer applies.
- **Unconfirmed** — proposed, awaiting a decision before it becomes scope.

Finished and withdrawn items are listed, never omitted for brevity. An item silently absent
reads exactly like an item forgotten, and the reader cannot tell which happened — which is
the failure this command exists to prevent.

Address items relationally — by file, by dependency role, by the thing they change. Never
number them; ordinals break the moment anything is inserted
(`docs/agents/workplan-structure.md`).

**These forms are the delta, and are forbidden**, however the rest of the statement is
worded:

```
plus the two we discussed
as before, but with X added
same as above, with Y dropped
the rest unchanged
(and the remaining items from earlier)
```

Each makes the reader rebuild the scope from memory. Rebuilding it is the failure.

**After the enumeration — not instead of it — note what moved** since the scope was last
stated, and flag anything discovered mid-work that has not been folded in. New work found
while working is scope that exists whether or not anyone has agreed to it; surface it here
with an **Unconfirmed** disposition rather than leaving it in the conversation to be lost.

Do only the scope statement. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.
