from unittest.mock import MagicMock

from shipping.quote import QuoteEngine


def test_quote():
    rates = MagicMock()
    rates.lookup.return_value = 12.5
    engine = QuoteEngine(rates)
    q = engine.quote("BR", 2.0)
    assert q.total == 25.0
    assert q.currency == "USD"
    assert rates.lookup.call_count == 1
    rates.lookup.assert_called_once_with("BR", tier="standard")
    assert engine._cache["BR"] == 12.5
    assert len(engine._cache) == 1
    q2 = engine.quote("BR", 1.0)
    assert q2.total == 12.5
    assert rates.lookup.call_count == 1
