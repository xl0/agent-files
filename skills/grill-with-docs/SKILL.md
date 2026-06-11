---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Start by outlining the question tree in `PLAN.md`.
Walk down the design tree, resolving dependencies between decisions.
For each question, provide your recommended answer.
Some questions might require a quick prototype, a test script and hands-on testing by the user. Confirm with the user.

Ask the questions, wait for feedback on each question before continuing. Clarify if the user did not provide a clear answer. Ask again if necessary.

Use question tool if present, the multiple questions version if more than one question. 
When the question tool allows, query user in rounds of independent questions - multiple questions per tool call, as long as later questions don't depend on the former ones.
If dependency between questions may exists, the dependent questions need to go into the next block.

As decisions crystallise, update `PLAN.md` inline with an implementation plan if appropriate.
Update `CODE.md` only when the actual codebase state changes. Keep docs concise and current-state oriented, not changelogs.
Compact `PLAN.md` as work lands: mark completed items, remove obsolete detail, and keep only the next useful plan.

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

```
/
├── PLAN.md
├── CODE.md
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

Don't couple `CONTEXT.md` to implementation details. Only include terms that are meaningful to domain experts.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
