"""A simple calculator for testing purposes."""


class Calculator:
    def __init__(self):
        self._history = []

    def add(self, a, b):
        result = a + b
        self._history.append(("add", a, b, result))
        return result

    def subtract(self, a, b):
        result = a - b
        self._history.append(("subtract", a, b, result))
        return result

    def multiply(self, a, b):
        result = a * b
        self._history.append(("multiply", a, b, result))
        return result

    def divide(self, a, b):
        if b == 0:
            raise ValueError("Cannot divide by zero")
        result = a / b
        self._history.append(("divide", a, b, result))
        return result

    def history(self):
        return list(self._history)

    def clear_history(self):
        self._history = []
