# Public practice checks: shipped to the browser sandbox, so they are visible and never count toward a gate (D-15).
def test_counts_each_level():
    lines = ["t1 INFO start", "t2 ERROR disk full", "t3 INFO ok", "t4 WARN slow"]
    assert count_levels(lines) == {"INFO": 2, "ERROR": 1, "WARN": 1}


def test_ignores_unknown_and_short_lines():
    assert count_levels(["", "only", "t1 info lowercase", "t2 FATAL x"]) == {}


def test_accepts_any_iterable():
    assert count_levels(iter(["t DEBUG a", "t DEBUG b"])) == {"DEBUG": 2}
