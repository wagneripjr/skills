# The invoice amounts thing — I need this written down properly today

This is the one from last week that we only found out about yesterday. I've dumped everything
below. Put the document in the repo under `docs/`.

## What we know happened

On 2026-07-09 someone ran `ledgerctl reconvert` against `billing-db` from a laptop. It's the
tool we use to recompute `invoice_lines.amount_eur` from `amount_original` when a rate gets
corrected. It's meant to be pointed at one day.

`ledgerctl reconvert` takes a `--from` and a `--to`. If you leave `--from` off, it defaults to
the epoch. And the conversion it applies is whatever the *current* row in `fx_rates` says, not
the rate that was effective on the invoice's own date. So a full-range run doesn't just recompute
last Thursday, it rewrites every historical invoice line in EUR at Thursday's rate.

The database is unambiguous about the blast: `updated_at` on `invoice_lines` was rewritten by the
job, and **2,317,884 rows** carry an `updated_at` inside 14:02:11–14:43:50 UTC on 2026-07-09.
We're CEST (GMT+2) so that's mid-afternoon our time. Diego says he kicked it off right after
standup, around four, and thought it ran for maybe ten minutes. The database says 41 minutes. Go
with the database.

I want to be careful here: 2,317,884 is the number of rows the job **touched**. It is not the
number of rows whose value **changed**. A line only changed if the rate on its own invoice date
differs from the 2026-07-09 rate, and we have a daily `fx_rates` table so that's derivable, but
nobody has derived it yet. We cannot read the before-values out of the database either — the
`invoice_lines_history` audit trigger was turned off in a performance change back in 2025, so
there's no before-image. What we *do* have is the nightly logical backup from 03:00 UTC that
same morning, and it restores fine. I tested it.

Diego's guess is "probably only a few thousand actually moved". That's a guess. He'd be the
first to say so.

## How we found out

We didn't. A customer disputed an invoice total and opened a support ticket at 09:41 UTC on
2026-07-15. Support escalated it to us the same morning. That is six days after the run.

Every signal we have was green the whole time. `ledger-sync` monitoring is job-success and rows
per second, and the reconvert run **succeeded** — it did exactly what it was told. There is no
alarm anywhere that looks at whether a value is correct.

## What we did about it

We restored the 03:00 UTC 2026-07-09 backup into a staging database, diffed the 40 invoice lines
belonging to the customer who complained, and wrote the correct values back into production for
those 40 lines. That's where it stands right now. Nothing else has been corrected. `ledgerctl`
is still installed on everyone's laptop and still behaves exactly the same way.

## What I checked and ruled out

- **The `fx-refresh` cron.** Thought it might have gone haywire. Its last run before the window
  was 03:00 UTC on 2026-07-09 and it only writes `fx_rates`. I checked `information_schema` —
  the cron role has no UPDATE grant on `invoice_lines` at all. It cannot have written those rows.
- **The `ledger-sync` v6.2 release on 2026-07-08.** Ruled out by the shape: every one of the
  2,317,884 rows has an `updated_at` inside a single 41-minute window. A service on the request
  path would have smeared the writes across the day. This was one batch process.

## What I can't prove

The exact command line is gone. `ledgerctl` logs to stdout, it was run from a terminal on a
laptop, that session is closed, and we have no audit of commands run against production. So the
"`--from` was omitted" part is me reading it off the row span — an all-time span is what an
omitted `--from` produces — not something I can show you.

## Who's affected and who isn't

- Only `amount_eur` was written. `amount_original` was never touched, which is why `payments-api`
  never noticed anything: it charges in the original currency and doesn't read the EUR column.
- The weekly `revenue-report` job reads `amount_eur` and ran on 2026-07-13. The report published
  that week is derived from whatever values were in the column at that point.
- Invoice lines in EUR-denominated originals are a no-op by definition, the conversion is 1:1.

## Other things that came up while we were in there

- `notification-worker` sends duplicate invoice emails roughly 1% of the time. Been like that a
  while. Nothing to do with this.
- The staging billing database has real production customer names in it. Also nothing to do with
  this, also needs dealing with.

## Output Specification

One Markdown document, written to the repository under `docs/`, recording this incident. Finance
and support will both read it, so it has to be precise about what is proven, what is bounded, and
what is still unknown.
