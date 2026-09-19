"""Tests for Calculator - mix of good and bad test practices.

This file is deliberately designed with a mix of quality levels
to demonstrate the Farley Score plugin. Run:

    /farley-score tests/
"""
import sys
import time
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, "src")
from calculator import Calculator


class TestCalculator(unittest.TestCase):
    """Some good tests, some problematic ones."""

    # --- Good tests: clear names, single assertion, behavior-focused ---

    def test_should_add_two_positive_numbers(self):
        calc = Calculator()
        result = calc.add(2, 3)
        self.assertEqual(result, 5)

    def test_should_subtract_larger_from_smaller(self):
        calc = Calculator()
        result = calc.subtract(3, 5)
        self.assertEqual(result, -2)

    def test_should_raise_error_when_dividing_by_zero(self):
        calc = Calculator()
        with self.assertRaises(ValueError):
            calc.divide(10, 0)

    # --- Bad: implementation-coupled (accesses private state) ---

    def test_history_internal_structure(self):
        calc = Calculator()
        calc.add(1, 2)
        self.assertEqual(calc._history[0], ("add", 1, 2, 3))
        self.assertEqual(len(calc._history), 1)

    # --- Bad: mega-test with too many assertions ---

    def test_all_operations(self):
        calc = Calculator()
        self.assertEqual(calc.add(1, 1), 2)
        self.assertEqual(calc.subtract(5, 3), 2)
        self.assertEqual(calc.multiply(3, 4), 12)
        self.assertEqual(calc.divide(10, 2), 5.0)
        self.assertEqual(len(calc.history()), 4)
        calc.clear_history()
        self.assertEqual(len(calc.history()), 0)

    # --- Bad: trivial tautology ---

    def test_true_is_true(self):
        self.assertTrue(True)

    def test_one_equals_one(self):
        self.assertEqual(1, 1)

    # --- Bad: sleep makes test slow and non-deterministic ---

    def test_add_with_delay(self):
        calc = Calculator()
        time.sleep(0.5)
        result = calc.add(10, 20)
        self.assertEqual(result, 30)

    # --- Bad: shared mutable state between tests ---

    shared_calc = Calculator()

    def test_shared_state_add(self):
        result = self.shared_calc.add(1, 1)
        self.assertEqual(result, 2)

    def test_shared_state_history(self):
        # This test depends on test_shared_state_add running first!
        self.assertGreater(len(self.shared_calc.history()), 0)


class TestCalculatorMockIssues(unittest.TestCase):
    """Tests demonstrating mock anti-patterns."""

    # --- Bad: mock tautology - asserting what you configured ---

    def test_mock_returns_configured_value(self):
        mock_calc = MagicMock()
        mock_calc.add.return_value = 42
        result = mock_calc.add(1, 2)
        self.assertEqual(result, 42)  # Tautology! We're testing the mock, not Calculator

    # --- Bad: framework test - testing Python's math, not our code ---

    def test_python_addition(self):
        self.assertEqual(2 + 2, 4)

    def test_python_string_methods(self):
        self.assertEqual("hello".upper(), "HELLO")


if __name__ == "__main__":
    unittest.main()
