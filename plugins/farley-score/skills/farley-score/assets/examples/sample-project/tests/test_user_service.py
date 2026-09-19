"""Tests for UserService - demonstrates mock usage patterns.

This file is deliberately designed with a mix of quality levels
to demonstrate the Farley Score plugin. Run:

    /farley-score tests/
"""
import unittest
from unittest.mock import MagicMock, patch, call

import sys
sys.path.insert(0, "src")
from user_service import UserService


class TestUserServiceGood(unittest.TestCase):
    """Well-designed tests using mocks appropriately."""

    def test_should_save_user_to_database_on_registration(self):
        db = MagicMock()
        email_sender = MagicMock()
        service = UserService(db, email_sender)

        service.register("alice", "alice@example.com")

        db.save.assert_called_once()
        saved_user = db.save.call_args[0][1]
        self.assertEqual(saved_user["username"], "alice")
        self.assertEqual(saved_user["email"], "alice@example.com")

    def test_should_send_welcome_email_on_registration(self):
        db = MagicMock()
        email_sender = MagicMock()
        service = UserService(db, email_sender)

        service.register("bob", "bob@example.com")

        email_sender.send.assert_called_once_with(
            "bob@example.com", "Welcome!", "Hello bob"
        )

    def test_should_reject_registration_without_username(self):
        db = MagicMock()
        email_sender = MagicMock()
        service = UserService(db, email_sender)

        with self.assertRaises(ValueError):
            service.register("", "test@example.com")

    def test_should_reject_registration_with_invalid_email(self):
        db = MagicMock()
        email_sender = MagicMock()
        service = UserService(db, email_sender)

        with self.assertRaises(ValueError):
            service.register("alice", "not-an-email")


class TestUserServiceBad(unittest.TestCase):
    """Poorly designed tests for contrast."""

    # --- Bad: over-specified interactions ---

    def test_register_calls_everything_in_order(self):
        db = MagicMock()
        email_sender = MagicMock()
        calls = MagicMock()
        calls.attach_mock(db.save, "save")
        calls.attach_mock(email_sender.send, "send")
        service = UserService(db, email_sender)

        service.register("charlie", "charlie@example.com")

        # Over-specified: testing exact call order and counts
        self.assertEqual(db.save.call_count, 1)
        self.assertEqual(email_sender.send.call_count, 1)
        self.assertEqual([name for name, _, _ in calls.mock_calls], ["save", "send"])

    # --- Bad: mock-only test (no real class) ---

    def test_mock_only_no_real_code(self):
        mock_service = MagicMock()
        mock_service.register.return_value = {"username": "test"}

        result = mock_service.register("test", "test@test.com")

        self.assertEqual(result["username"], "test")
        mock_service.register.assert_called_once()

    # --- Bad: testing internal implementation details ---

    def test_deactivate_sets_active_false(self):
        db = MagicMock()
        db.find.return_value = {"username": "alice", "active": True}
        email_sender = MagicMock()
        service = UserService(db, email_sender)

        service.deactivate("alice")

        # Inspecting the exact internal mutation
        updated_user = db.update.call_args[0][1]
        self.assertFalse(updated_user["active"])
        self.assertEqual(updated_user["username"], "alice")

    # --- Bad: cryptic test name ---

    def test_it_works(self):
        db = MagicMock()
        db.find_all.return_value = [
            {"username": "a", "active": True},
            {"username": "b", "active": False},
            {"username": "c", "active": True},
        ]
        email_sender = MagicMock()
        service = UserService(db, email_sender)

        result = service.find_active_users()

        self.assertEqual(len(result), 2)


if __name__ == "__main__":
    unittest.main()
