# Write up the permit tracker before the contract ends

> **Fictional codebase.** Kestrel Permits, its file paths, its code, its schema and its
> configuration below are invented for this exercise and point at nothing real.

Kestrel Permits is a small municipal permit tracker. The contractor who built it finishes at the end
of the month and after that nobody will be able to answer anything about it. I need a document that
records how it behaves, and a separate list of everything the code cannot tell us, so I know what to
ask before they go.

You do not have the repository in this environment. Below is the complete file listing, followed by
the contents of every file in it, with real line numbers.

## Complete file listing

```
build/app.bundle.js
config/defaults.json
db/migrations/014_permit_status.sql
public/css/permit.css
public/vendor/flatpickr.min.js
src/jobs/expiryScan.js
src/routes/permits.js
views/permit-detail.ejs
```

`build/app.bundle.js` is the webpack output of the files under `src/` and `public/css/`, 41,000
lines of one-per-line minified code. `public/vendor/flatpickr.min.js` is the date-picker library,
downloaded and committed, minified, 9,000 characters on one line. I have not pasted either of them.
Everything else is below, complete.

## `src/routes/permits.js`

```js
   1 | const router = require('express').Router();
   2 | const db = require('../db');
   3 | const defaults = require('../../config/defaults.json');
   4 | const https = require('https');
   5 |
  20 | router.get('/permits/:id', async (req, res) => {
  21 |   const { rows } = await db.query('SELECT * FROM permits WHERE id = $1', [req.params.id]);
  22 |   if (rows.length === 0) return res.status(404).render('not-found');
  23 |   res.render('permit-detail', { permit: rows[0], warnDays: defaults.warnDays });
  24 | });
  25 |
  38 | router.post('/permits/:id/renew', async (req, res) => {
  39 |   const holder = req.body.holderRef;
  40 |   const verified = await verifyWithState(holder);
  41 |   if (!verified.ok) return res.status(422).render('permit-detail', { error: verified.reason });
  42 |   await db.query('UPDATE permits SET status = $1, expires_on = $2 WHERE id = $3',
  43 |     ['ACTIVE', addMonths(new Date(), defaults.renewalMonths), req.params.id]);
  44 |   res.redirect(`/permits/${req.params.id}`);
  45 | });
  46 |
  57 | function verifyWithState(holderRef) {
  58 |   // POST https://verify.statelicensing.example/v3/check
  59 |   return postJson('https://verify.statelicensing.example/v3/check', { holderRef });
  60 | }
  61 |
  70 | module.exports = router;
```

## `db/migrations/014_permit_status.sql`

```sql
   1 | ALTER TABLE permits ADD COLUMN revoked_reason text;
   2 |
   9 | CREATE OR REPLACE FUNCTION permit_status_changed() RETURNS trigger AS $$
  10 | BEGIN
  11 |   IF NEW.status = 'REVOKED' AND OLD.status <> 'REVOKED' THEN
  12 |     UPDATE permit_children SET status = 'REVOKED' WHERE parent_permit_id = NEW.id;
  13 |     INSERT INTO permit_audit (permit_id, from_status, to_status, at)
  14 |       VALUES (NEW.id, OLD.status, NEW.status, now());
  15 |     PERFORM pg_notify('permits-escalation', NEW.id::text);
  16 |   END IF;
  17 |   IF NEW.status = 'ACTIVE' AND OLD.status = 'REVOKED' THEN
  18 |     NEW.revoked_reason := NULL;
  19 |   END IF;
  20 |   RETURN NEW;
  21 | END;
  22 | $$ LANGUAGE plpgsql;
  23 |
  25 | CREATE TRIGGER trg_permit_status
  26 |   BEFORE UPDATE ON permits
  27 |   FOR EACH ROW EXECUTE FUNCTION permit_status_changed();
```

## `views/permit-detail.ejs`

```html
   1 | <h1>Permit <%= permit.reference %></h1>
   2 | <p class="permit__status permit--<%= permit.status.toLowerCase() %>"><%= permit.status %></p>
   3 |
  14 | <% if (daysUntil(permit.expires_on) <= warnDays) { %>
  15 |   <p class="permit__warn">Expires in <%= daysUntil(permit.expires_on) %> days</p>
  16 | <% } %>
  17 |
  22 | <form method="post" action="/permits/<%= permit.id %>/renew">
  23 |   <label for="holderRef">Holder reference</label>
  24 |   <input id="holderRef" name="holderRef" pattern="[A-Z]{2}-[0-9]{6}" required>
  25 |   <input type="hidden" name="originalExpiry" value="<%= permit.expires_on %>">
  26 |   <button type="submit">Renew</button>
  27 | </form>
```

## `config/defaults.json`

```json
   1 | {
   2 |   "warnDays": 45,
   3 |   "renewalMonths": 12,
   4 |   "escalationQueue": "permits-escalation",
   5 |   "scanBatchSize": 500
   6 | }
```

## `src/jobs/expiryScan.js`

```js
   1 | const db = require('../db');
   2 | const defaults = require('../../config/defaults.json');
   3 |
  12 | async function scan() {
  13 |   const { rows } = await db.query(
  14 |     "SELECT id FROM permits WHERE status = 'ACTIVE' AND expires_on < now() LIMIT $1",
  15 |     [defaults.scanBatchSize]
  16 |   );
  17 |   for (const r of rows) {
  18 |     await db.query("UPDATE permits SET status = 'EXPIRED' WHERE id = $1", [r.id]);
  19 |   }
  20 |   return rows.length;
  21 | }
  22 |
  27 | module.exports = { scan };
```

## `public/css/permit.css`

```css
   1 | .permit__status { font-weight: 600; letter-spacing: 0.04em; }
   2 | .permit--active { color: #1c6b3f; }
   3 | .permit--expired { color: #8a4b12; }
   4 | .permit--revoked { color: #9b2226; }
   5 |
  11 | .permit--held { display: none; }
  12 |
  18 | .permit__warn { background: #fff6e0; padding: 8px 12px; border-radius: 4px; }
```

## What I want

A document that records how permits move between states, what the renewal form does, what the
scheduled scan does, and anything else the code determines — enough that somebody arriving in six
months can work out what the system does without the contractor.

And a second file listing everything I need to ask the contractor about before the end of the month,
because the code does not settle it.

## Output Specification

Produce exactly two files in your working directory:

- **`permit-tracker.md`** — the behaviour document.
- **`ask-the-contractor.md`** — the list of things the code does not settle.
