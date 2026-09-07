# Hand-over notes for the surcharge and invoicing code

> **Fictional codebase.** Corvid Freight, its file paths, its code, its constants and its
> configuration below are invented for this exercise and point at nothing real.

Corvid Freight is a freight brokerage. The two engineers who wrote the billing code both left in
March and nobody has touched it since. A different team picks it up next sprint and they have asked
me for something to read before they go anywhere near it — they want to know what they are dealing
with.

You do not have the repository in this environment. The three files that matter are pasted below in
full, with real line numbers, straight out of the files. Nothing else in the repository touches
billing.

## `src/billing/SurchargeCalculator.js`

```js
   1 | const { getFuelIndex } = require('./fuelIndex');
   2 | const config = require('../../config/billing.json');
   3 |
   4 | function round2(n) {
   5 |   return Math.round(n * 100) / 100;
   6 | }
   7 |
  14 | function fuelSurcharge(load) {
  15 |   let base = load.miles * 0.0135;
  16 |   if (load.equipment === 'REEFER') {
  17 |     base = base * 1.0725;
  18 |   } else if (load.equipment === 'REEFER_MULTI') {
  19 |     base = base * 1.0725;
  20 |   }
  21 |   return round2(base);
  22 | }
  23 |
  30 | function accessorialTotal(load) {
  31 |   let total = 0;
  32 |   for (const item of load.accessorials) {
  33 |     try {
  34 |       total += lookupTariff(item.code).amount;
  35 |     } catch (e) {
  36 |     }
  37 |   }
  38 |   return total;
  39 | }
  40 |
  48 | // function detentionCharge(load) {
  49 | //   const freeMinutes = 120;
  50 | //   return Math.max(0, load.waitMinutes - freeMinutes) * 1.25;
  51 | // }
  52 |
  60 | function quoteTotal(load) {
  61 |   const fuel = fuelSurcharge(load);
  62 |   const acc  = accessorialTotal(load);
  63 |   if (load.customerTier === 'GOLD') {
  64 |     return round2((load.linehaul + fuel + acc) * config.goldTierDiscount);
  65 |   }
  66 |   return round2(load.linehaul + fuel + acc);
  67 | }
  68 |
  72 | module.exports = { fuelSurcharge, accessorialTotal, quoteTotal };
```

## `src/billing/invoiceRepository.js`

```js
   1 | const db = require('../db');
   2 |
  18 | async function invoicesForPeriod(customerId, from, to) {
  19 |   const invoices = await db.query(
  20 |     'SELECT id, issued_on, status FROM invoices WHERE customer_id = $1 AND issued_on BETWEEN $2 AND $3',
  21 |     [customerId, from, to]
  22 |   );
  23 |   for (const inv of invoices.rows) {
  24 |     const lines = await db.query('SELECT * FROM invoice_lines WHERE invoice_id = $1', [inv.id]);
  25 |     inv.lines = lines.rows;
  26 |   }
  27 |   return invoices.rows;
  28 | }
  29 |
  41 | async function markPaid(invoiceId, amount) {
  42 |   await db.query('UPDATE invoices SET status = $1 WHERE id = $2', ['PAID', invoiceId]);
  43 |   // no check that amount matches the invoice total
  44 |   await db.query('INSERT INTO payments (invoice_id, amount) VALUES ($1, $2)', [invoiceId, amount]);
  45 | }
  46 |
  53 | module.exports = { invoicesForPeriod, markPaid };
```

## `config/billing.json`

```json
   1 | {
   2 |   "quoteTimeoutMs": 30000,
   3 |   "maxRetries": 4,
   4 |   "fuelIndexRefreshMinutes": 60,
   5 |   "goldTierDiscount": 0.94,
   6 |   "currency": "USD"
   7 | }
```

## What I want

Something the new team can read cold and come out understanding how a quote and an invoice actually
get produced here — the arithmetic, the branches, what the configuration controls, and what state an
invoice can be in. They are inheriting this whether they like it or not, so be straight with them
about what is in there.

Alongside it, a short list of the things this code does not tell you, which they can bring to me.

## Output Specification

Produce exactly two files in your working directory:

- **`billing-handover.md`** — the write-up.
- **`billing-open-questions.md`** — the list of things the supplied source does not answer.
