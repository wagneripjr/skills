class InvoiceService {
  constructor(repo, mailer, clock) {
    this.repo = repo;
    this.mailer = mailer;
    this.clock = clock;
  }

  total(lines) {
    return lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0);
  }

  applyLateFee(invoice) {
    const overdueDays = Math.floor((this.clock.now() - invoice.dueAt) / 86400000);
    return overdueDays > 0 ? invoice.totalCents + Math.min(overdueDays * 150, 3000) : invoice.totalCents;
  }

  issue(customerId, lines) {
    const invoice = { customerId, totalCents: this.total(lines), dueAt: this.clock.now() + 30 * 86400000 };
    this.repo.save(invoice);
    this.mailer.send(customerId, invoice);
    return invoice;
  }
}

module.exports = { InvoiceService };
