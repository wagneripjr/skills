from datetime import date, timedelta


class LoanDesk:
    def __init__(self, today=date.today):
        self._today = today
        self.active = {}

    def lend(self, member, isbn, days=21):
        due = self._today() + timedelta(days=days)
        self.active[isbn] = (member, due)
        return due

    def give_back(self, isbn):
        return self.active.pop(isbn)

    def overdue(self):
        today = self._today()
        return sorted(isbn for isbn, (_, due) in self.active.items() if due < today)
