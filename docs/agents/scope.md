# Scope

Every assignment has a boundary. This topic owns that boundary: how it is **drawn**, how it is **respected**, and how it is **stated**.

The three are not symmetric. Drawing a scope is the workplan author's act; respecting one is the implementer's; stating one is done by both, every turn. What unites them is that all three fail the same way — a boundary that is wrong, exceeded, or incompletely described loses work that nobody notices is missing.

Applies to every turn, both views. This is a Process topic — it governs all other work.

## What scope is

**Scope is the file and the work stage you were handed — not a list of the symbols inside it.** It bounds *where* you work: this file, this element, this node. It does not bound *how completely* you do the element you were given.

That distinction is the whole topic. Expanding sideways — a second file, another node, an unrequested refactor — is a scope violation. Doing the assigned element partially is not staying in scope; it is leaving the element unfinished. The two failures look opposite and are confused constantly, because both can be defended as "I stayed in scope."

## Drawing a scope

A scope is drawn deliberately, before work starts, around **one unit of work** — and the author resolves what belongs inside it rather than leaving the implementer to decide.

The node is this repo's unit, and its anatomy is owned by [workplan-structure](workplan-structure.md): one source file per node, its support elements, what is never a node of its own, and the rule that an author who writes "check if" or "determine whether" has deferred a decision that was theirs. Read it there.

What belongs here is the principle those rules serve: **a boundary drawn loosely is a boundary the implementer must guess at**, and an implementer who guesses will guess small.

## Respecting a scope

Stay in the exact scope you were given. Do not expand it, and do not discuss work outside it. Work outside scope is a discovery, not a liberty — report it and halt (see [discovery-halt](discovery-halt.md)). The one-file-per-turn rule that enforces this is owned by [loop](loop.md).

### Context the user hands you

Ambient context means nothing **until the user references it** (see [precedence](precedence.md)). A selection delivered with an instruction is that reference. When the user highlights a range and invokes a command against it, the highlighting is an act of designation — they chose that range and handed it to you, and it carries the same authority as the words of the command itself. It is the user's explicit instruction, first in the authority order.

The distinction is the act, not the appearance. The open file, the cursor position, and the terminal output are merely *present*; a selection passed with an instruction was *given*. Do not reason from how similar the two look on screen — ask only whether the user designated it.

Two consequences:

- The selection is the scope. Do not read above or below it to find work, do not treat its last line as a position to continue from, and do not substitute a region you judge more relevant.
- If the selection cannot support the instruction — it is a fragment, or it spans more than the instruction addresses — report that and halt (see [discovery-halt](discovery-halt.md)). Do not read outward to repair it.

### Node silence is not exclusion

A workplan node lists **elements** — the interface, the mock, the guard, the guard test, the tests, the provides. It does not list the **symbols** inside them, and it is not required to. The symbols come from the interface's export surface, which is a fact on disk, not from the node's bullets, which are an author's summary of it.

So a node that names three symbols where the interface exports seven has not excluded the other four. It has said nothing about them, and silence is not exclusion. The element is completed to the standard that governs it — every owned type guarded ([guards](guards.md)), every owned object type built and invalidated and every owned function mocked ([mocks](mocks.md)), every exported symbol proven ([tests](tests.md)), every symbol a consumer needs exported ([boundaries](boundaries.md)) — whatever the node happened to enumerate.

This is not scope expansion. The node assigned you the element; the standard defines what finishing that element means. Reading a node's bullets as the complete symbol list is the error, and it is the error that leaves a mock missing until something a dozen nodes later needs it.

### Infill and report — never ask permission to comply

When the node is silent and the standard is not, do the work and **report it in your final response**: which symbols the node omitted, and what you supplied. Reported so the node can be corrected — the workplan should end up matching reality, and it will not if the gap is filled silently.

**Do not halt to ask whether to follow a rule.** A topic that already answers the question has already given you permission; asking again is not diligence, it is deferring compliance to the user. Halting is for crossing a boundary — another file, another node, a missing producer you cannot supply from here ([discovery-halt](discovery-halt.md)) — never for obeying a standard inside the element you were handed.

## Stating a scope

### Always the whole scope, never the delta

When a scope changes — something is added, finished, dropped, or corrected — **restate the entire scope**. Never state only the change.

A delta is a statement about a difference. Everything outside the difference goes unsaid, and what goes unsaid is dropped: by the reader, by the next agent, and by you three turns later working from your own summary. Nobody drops it deliberately. It simply stops being mentioned, and then it stops existing.

This holds whatever is being scoped — a work scope after a correction, an enumeration after a gap is found, a plan after a step is added, a set of findings after some are resolved.

The restatement is **complete and dispositioned**: every item, with its current state. Finished items are listed as finished, not omitted for brevity — an item silently absent is indistinguishable from an item forgotten, and the reader cannot tell which happened.

Forbidden forms, all of which are deltas wearing a restatement's clothes:

```
plus the two we discussed
as before, but with X added
same as above, with Y dropped
the rest unchanged
(and the remaining items from earlier)
```

Each of these makes the reader reconstruct the scope from conversation history. That reconstruction is the failure — it is exactly what the restatement exists to prevent, and the party doing it has less context than the party who wrote it.

**Scope canary.** A restatement that references prior state instead of enumerating it, or that omits items on the grounds they are already done, is discarded (see [traceability](traceability.md)). Checkable at a glance: every item present, every item dispositioned, nothing standing in for a list.

### Coverage canary

An element that owns symbols reports its enumeration: the symbols the interface exports, and each one's disposition for this element. A response with no enumeration, or one naming fewer symbols than the interface exports, is discarded (see [traceability](traceability.md)). The enumeration is checkable against the interface file at a glance, so getting it wrong is proof the surface was never read.

**A count is not an enumeration.** A number stands in for the list without stating it, cannot be checked against the interface, and survives being wrong. "Twenty-nine members" names no symbol and is discarded as an absent enumeration; a number set beside a list is discarded on the same ground, the list being the whole of what was owed.

**The canary binds both views, and each enumerates once.** A response enumerates in the response — that enumeration *is* the proof the surface was read, so nothing stands in for it. A workplan node enumerates in **one** element: the one that declares the surface, where the member list is that file's content rather than a description of another file's. Specifying a surface by cardinality, or by a delta against its prior state, is the malformed construction in [workplan-structure](workplan-structure.md)'s table in either view, and the node carrying it is discarded.

**Every other element references that one; it does not restate it.** What the canary tests is whether the list can be checked without rebuilding it. A count cannot be checked, and a delta against an unstated prior state cannot be checked — but a reference to the element that carries the enumeration can, because you follow it and read the list. A reference is therefore not an absent enumeration. A second copy is something worse: two enumerations of one surface can disagree, and a node carrying six copies has six chances to be wrong where it needed none. Downstream elements need no list of their own, because the standard governing each already says *all of them* — every owned type guarded ([guards](guards.md)), every property defaulted ([mocks](mocks.md)), every exported symbol proven ([tests](tests.md)). An element states only what its own standard cannot derive.

This is the same rule as the one above, applied to a symbol surface rather than a work scope. "No mock required" and "deliberately not exported" are dispositions; they are stated, not omitted.

## Precedence

This topic outranks the workplan. A node step that widens a scope beyond one unit of work, that treats its own bullets as the complete symbol list, or that asks the implementer to determine what is in scope, is defective — comply with this topic and report the discrepancy (see [precedence](precedence.md)).

