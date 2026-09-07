# I have to size this by Thursday and I keep feeling like I'd be guessing

Product handed me the PRD below and I'm on the hook for an estimate at Thursday's planning
session. I've read it twice. It reads well and I could probably start typing, but every time I
try to put a number on it I hit something I'd be deciding on Product's behalf without telling
anyone.

Before Thursday I want a written pass over it: what is actually settled, what isn't, and what
I'd have to take into the room and get answered. I'd rather show up with the list than show up
with an estimate that quietly assumes half of it.

Here is the document exactly as it came to me.

```markdown
# PRD: Shipment Alerts Dashboard

**Product:** Vantik Freight Cloud
**Author:** Product (Logistics)
**Status:** Approved for engineering

## Background

Vantik Freight Cloud gives shippers visibility into freight moving across roughly 40 carriers.
Support currently fields about 200 "where is my load" tickets a week, and almost all of them are
a customer discovering a problem we already knew about. We want customers to see the problem
before they call us.

## What we're building

A Shipment Alerts dashboard. When a shipment goes off-plan we raise an alert and surface it at
the top of the customer's dashboard, in real time.

Alert types for v1:

- **Late departure** — the shipment has not departed by the end of its scheduled pickup window
- **Late arrival** — projected arrival is past the promised delivery date
- **Exception** — the carrier has reported a problem code (damage, refusal, weather hold)
- **Stalled** — no tracking update has been received in a while

## Where the data comes from

Carrier tracking events already flow into the platform through our existing carrier
integrations. Ops also updates shipment status by hand in the Ops Console when a carrier phones
or emails something in. Both of these feed the alerts.

## User experience

- Alerts appear on the dashboard in real time, newest first.
- Each alert shows the shipment reference, the customer's PO number, the carrier, the alert
  type, and when we detected it.
- Clicking an alert opens the existing shipment detail page.
- A user can dismiss an alert once they have dealt with it. Dismissed alerts drop off the list.
- Account Managers can override an alert's status.
- Brokers get the broker view.

## Notifications

Users can opt in to email for Exception and Late arrival alerts. Email goes out as soon as the
alert is raised.

## Reporting

We keep alerts so the quarterly service review deck can show alert volume by carrier and by
lane. Ops also wants to be able to pull a CSV.

## Success metrics

- 30% reduction in "where is my load" support tickets within one quarter of launch
- 60% of active customers view the dashboard in a given week

## Out of scope for v1

- SMS and in-app push
- Alerts on inbound shipments — outbound only
- Predictive or ML-based alerting

## Open items (Product will close these before launch)

- Final copy for the alert descriptions
- Icon set
```

## Output Specification

Write two files into the working directory.

1. `readiness-review.md` — my read of the document before Thursday. What is genuinely decided
   and needs no discussion, what is not, and for each unsettled thing, what actually changes in
   the build depending on which way it goes.

2. `open-questions.md` — the questions I take into the room, grouped by who in that room can
   answer each one.
