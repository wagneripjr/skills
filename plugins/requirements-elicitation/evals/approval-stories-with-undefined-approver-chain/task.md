# Refinement is Monday and I don't want to sit there guessing out loud

Our PM wrote up the expense-approval work as sprint-ready stories and wants the squad to point
them on Monday. I've been through them and they're clean stories — better than what we usually
get — but I think a lot of the actual behaviour is hiding between them rather than inside any
one of them. I'd like to send the questions out on Friday so people come with answers instead
of us burning the session discovering the problem.

Here is the doc as written.

```markdown
# Expense Approvals — sprint-ready stories

**Squad:** Spend Platform
**PM:** Product

## Context

Employees submit expenses in Ledgerly today and Finance approves everything by hand in a
spreadsheet. It works, barely. Our London and Berlin teams have been submitting into the same
spreadsheet since last year and it has not got easier. Our auditors sampled the spreadsheet at
year end and it was a painful three weeks. We're moving approval into the product.

## Stories

**SP-101** As an employee, I can submit an expense with an amount, a category, a date, a receipt
image and a note, so that I can get reimbursed.
- Submission fails if the receipt is missing on anything over 25.
- The expense shows as "Submitted" on my expenses page.

**SP-102** As an approver, I see the expenses waiting on me in one list, so I don't have to
chase email.
- The list shows submitter, amount, category, date, and how long it has been waiting.
- I can approve or reject from the list without opening the expense.
- Rejecting requires a reason.

**SP-103** As Finance, expenses over 5,000 require a second approval, so that large spend gets
extra scrutiny.
- The expense stays pending until both approvals are in.

**SP-104** As an employee, I am notified when my expense is approved or rejected.

**SP-105** As an employee, I can edit an expense that has not been paid yet.
- I can change the amount, the category, the note and the receipt.

**SP-106** As Finance, I can export the month's approved expenses so I can push them into the
accounting system.

**SP-107** As an approver, I can delegate my approvals while I'm out.

## How approvers are determined

The approver is the submitter's manager. We already sync the reporting line nightly from
Peoplebase.

## Non-goals this sprint

- Corporate card feeds
- Per-department budgets and budget blocking
- A mobile app
```

## Output Specification

Write two files into the working directory.

1. `questions-for-pm.md` — the things only Product, Finance or whoever owns the policy can
   decide.

2. `questions-for-engineering.md` — the things the squad has to decide or investigate for
   itself.

Put each question where it can actually be answered, and make each one answerable — I want
Monday to be people saying yes, no, or a number, not "good question".
