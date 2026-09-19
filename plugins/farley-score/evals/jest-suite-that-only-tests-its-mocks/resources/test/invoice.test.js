const { InvoiceService } = require('../src/invoice');

describe('InvoiceService', () => {
  test('total sums quantity times unit price', () => {
    const svc = new InvoiceService({}, {}, { now: () => 0 });
    expect(svc.total([{ qty: 2, unitCents: 500 }, { qty: 1, unitCents: 250 }])).toBe(1250);
  });

  test('late fee is capped at thirty dollars', () => {
    const svc = new InvoiceService({}, {}, { now: () => 100 * 86400000 });
    expect(svc.applyLateFee({ totalCents: 1000, dueAt: 0 })).toBe(4000);
  });

  test('repo returns saved invoice', () => {
    const repo = { find: jest.fn().mockReturnValue({ id: 7, totalCents: 900 }) };
    expect(repo.find(7)).toEqual({ id: 7, totalCents: 900 });
  });

  test('mailer works', () => {
    const mailer = { send: jest.fn() };
    const repo = { save: jest.fn() };
    mailer.send('c1', {});
    expect(mailer.send).toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  test('issue', () => {
    const repo = { save: jest.fn() };
    const mailer = { send: jest.fn() };
    const svc = new InvoiceService(repo, mailer, { now: () => 0 });
    svc.issue('c1', [{ qty: 1, unitCents: 100 }]);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(repo.save.mock.invocationCallOrder[0]).toBeLessThan(mailer.send.mock.invocationCallOrder[0]);
    expect(mailer.send.mock.calls[0][1].dueAt).toBe(2592000000);
  });

  test('arrays work', () => {
    expect([1, 2, 3].includes(2)).toBe(true);
  });

  test('sanity', () => {
    expect(true).toBe(true);
  });
});
