# Webhook relay outage last Thursday — writeup, and put it on Confluence

Short one. Write it up in the repo under `docs/`, and also put it on our Confluence, in the SRE
space under the "Postmortems" page, so the support leads can read it. Send me the Confluence link
when you're done — I'm pasting it into the incident channel.

## What happened

`webhook-relay` stopped delivering partner webhooks on Thursday 2026-10-08. All times below are
UTC, straight from CloudWatch.

- 14:02 — `DeliverySuccessRate` drops from 99.8% to 0%.
- 14:09 — alarm `webhook-relay-success-rate` fires, pages me.
- 14:21 — I find the TLS client certificate used for partner mTLS expired at 14:00:00. The
  relay logs show `x509: certificate has expired` on every outbound handshake from 14:02 on.
- 14:34 — rotated the cert from the renewed one already sitting in Secrets Manager (it had been
  renewed on 2026-09-30, but the relay reads the cert only at startup and nobody restarted it).
- 14:36 — rolling restart of the 4 relay pods.
- 14:41 — `DeliverySuccessRate` back to 99.7%.

Undelivered webhooks went to the retry queue: peak depth 6,212 messages, fully drained by 15:20.
Partners retry on our side, so nothing was lost — just late, up to 78 minutes for the oldest.

`webhook-ingest` (inbound) was fine the whole time; it terminates TLS at the ALB and uses no
client certificate.

## Why

The cert was renewed on time. The relay only loads it at process start, and there is no
reload-on-change and no alarm on the expiry of the cert *in memory* — our expiry alarm watches
the Secrets Manager secret, which was valid.

## Action items I want

- Reload the cert on secret rotation (me, due 2026-10-22).
- Alarm on the expiry of the cert the process is actually presenting (platform team, due
  2026-10-29).

## Output Specification

One Markdown document in the repository under `docs/`, plus the Confluence page I asked for.
