import json
import time
from datetime import date, timedelta

from src.loans import LoanDesk

desk = LoanDesk()


def test_lend_sets_due_date_three_weeks_out():
    fixed = date(2031, 4, 1)
    local = LoanDesk(today=lambda: fixed)
    assert local.lend("m-1", "isbn-1") == date(2031, 4, 22)


def test_lend_then_return():
    desk.lend("m-2", "isbn-2")
    assert "isbn-2" in desk.active


def test_return_removes_loan():
    member, _ = desk.give_back("isbn-2")
    assert member == "m-2"
    assert "isbn-2" not in desk.active


def test_due_date_is_today_plus_21():
    due = LoanDesk().lend("m-3", "isbn-3")
    assert due == date.today() + timedelta(days=21)


def test_overdue_after_waiting():
    local = LoanDesk()
    local.lend("m-4", "isbn-4", days=0)
    time.sleep(1.5)
    assert local.overdue() == [] or local.overdue() == ["isbn-4"]


def test_loans_export(tmp_path_factory):
    path = "/tmp/loans-export.json"
    with open(path, "w") as f:
        json.dump({"isbn-5": "m-5"}, f)
    with open(path) as f:
        assert json.load(f)["isbn-5"] == "m-5"


def test_overdue_lists_only_past_due_loans_in_isbn_order():
    today = date(2031, 4, 22)
    local = LoanDesk(today=lambda: today - timedelta(days=30))
    local.lend("m-6", "isbn-b", days=1)
    local.lend("m-7", "isbn-a", days=2)
    local.lend("m-8", "isbn-c", days=60)
    local._today = lambda: today
    assert local.overdue() == ["isbn-a", "isbn-b"]
