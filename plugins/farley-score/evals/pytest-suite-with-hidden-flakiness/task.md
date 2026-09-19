# Why does this suite fail on some machines?

`tests/test_loans.py` covers `src/loans.py`. It's green on my laptop, red maybe one run in ten on
CI, and it breaks outright when someone runs the tests in parallel or in a different order.

Score the quality of this suite and tell me what's making it unreliable, with the specific tests
and lines. Save the review as `farley-score-report.md` at the repo root. Please don't touch the
tests themselves - I want to fix them myself once I understand what's wrong.
