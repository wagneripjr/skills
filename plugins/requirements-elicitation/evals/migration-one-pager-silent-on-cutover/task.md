# Asked to bless a replacement plan that fits on one page

Leadership wants a yes on this at the end of the week and I'm the one who has to say whether
engineering is comfortable. The one-pager below is what everyone has read. It is short, which is
being taken as a sign that the work is small.

I'm not trying to kill it. I want to write down what we would be taking on if we say yes —
where this can hurt us, how badly, and which of those things are only dangerous because nobody
has decided them yet. Then I want the shortest possible list of things I need answered before
the flag goes on for the first customer.

Here is the one-pager.

```markdown
# One-pager: Replace Pricer v1

**Owner:** Product
**Reviewers:** Engineering leadership
**Target:** end of Q3

## Why

Pricer v1 has lived inside the monolith for nine years. Nobody wants to touch it. Adding a new
discount type takes a sprint and usually breaks something adjacent. Two regional teams have
stopped waiting on us and quote their larger deals by hand in spreadsheets, because the engine
cannot express the terms they agree.

## What

Build Pricing Service, a standalone service that owns quote pricing. It takes an equipment
list, a rental duration, a customer and a region, and returns a quote with a line-item
breakdown.

## Scope

- All rental line items, delivery fees, damage waiver, and taxes
- The five existing discount types, plus contract-rate overrides for enterprise customers
- Same numbers as today: the new engine returns the same price as Pricer v1
- Pricing analysts can override a line item

## Rollout

We put it behind a flag and move customers over region by region. If anything looks wrong we
turn the flag off.

## Dependencies

Taxes come from Avalor, the same service Pricer v1 calls today.

## Non-goals

- Repricing a contract that has already been accepted
- Changing any prices — this is a like-for-like replacement
- Dynamic or demand-based pricing

## Risks we already know about

- Q3 is our busiest season
- Everyone who wrote Pricer v1 has left the company
```

## Output Specification

Write two files into the working directory.

1. `risk-register.md` — what we would be taking on. For each entry, where in the document it
   comes from, how bad it is, and why it is that bad rather than one notch less.

2. `cutover-questions.md` — the things that must be answered before we turn the flag on for the
   first customer, and what we would be assuming if we turned it on without an answer.
