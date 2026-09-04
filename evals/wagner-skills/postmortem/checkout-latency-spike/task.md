# Write up last night's incident

We had a bad one on the checkout path and I need the writeup before I lose the dashboards.
Everything below is what I have. Put the document in the repo under `docs/`.

## What I know

Alarm `checkout-api-p99` went off. I was paged. Datadog says the API p99 went from about 240ms
to over 9 seconds. The RDS console shows `DatabaseConnections` on `orders-db` pinned at 200
(that's the max_connections we have set) from 02:14 UTC through 03:02 UTC. `checkout-api` was
returning 503s — ALB target group showed `HTTPCode_ELB_5XX_Count` around 4.1k over that window.

`inventory-api` and `pricing-api` were fine the whole time. They sit on their own instances.
`search-api` also fine, it doesn't touch Postgres at all.

I restarted the `checkout-api` ECS service at 03:00 local (we're GMT-3) and it recovered within
about two minutes. Confirmed clean on the dashboard at 03:04 local.

First customer complaint in the support channel was 23:31 local. The alarm didn't fire until
23:19 local — wait, no, the alarm fired first. Let me re-check: PagerDuty says the page was
23:19 local, support ticket was 23:31 local.

## Things I looked at

- Thought it might be the deploy. Someone shipped `checkout-api` v4.18.2 at 21:40 local. But
  the CloudWatch graph shows connection count was flat and normal for four hours after that
  deploy, so I don't think the deploy is it.
- Thought it might be a traffic spike. ALB `RequestCount` was actually slightly *below* the
  previous Tuesday for the same hour. So no.
- The `orders-db` slow query log has a bunch of entries for the `SELECT ... FROM order_items
  JOIN orders WHERE customer_id = $1` query, average 8.4s, normally 40ms. That query has no
  index on `order_items.order_id` — I checked `\d order_items` and there isn't one.
- Our connection pool in `checkout-api` is `pg.Pool` with `max: 50` per task and we run 4 tasks.
  So 200. There's no `connectionTimeoutMillis` set and no statement timeout on the database.

## Other stuff I noticed while digging

- The `payments-worker` has been logging `ECONNRESET` warnings about 30 times an hour for weeks.
  Nothing to do with this, but somebody should look.
- Our RDS backup retention on `orders-db` is 1 day. That seems low.

## Not sure about

I don't have APM traces for the window — our retention is 24h and I'm writing this two days
later. So I can't show the per-endpoint breakdown I'd want.
