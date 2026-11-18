# atlas-gate-canary-w01-7f3a
# Hidden gate tests for ex-w01-log-levels. These run only inside atlas-lab's network-less container.


def test_counts_mixed_levels():
    lines = ["a DEBUG x", "b INFO y", "c WARN z", "d ERROR w", "e INFO v"]
    assert count_levels(lines) == {"DEBUG": 1, "INFO": 2, "WARN": 1, "ERROR": 1}


def test_extra_whitespace_and_newlines():
    lines = ["t1   ERROR   disk full\n", "\tt2\tWARN\tslow", "t3 INFO\n"]
    assert count_levels(lines) == {"ERROR": 1, "WARN": 1, "INFO": 1}


def test_level_must_be_second_field():
    assert count_levels(["ERROR t1 x", "t2 x ERROR", "t3 INFO"]) == {"INFO": 1}


def test_case_sensitive():
    assert count_levels(["t error", "t Error", "t ERROR"]) == {"ERROR": 1}


def test_no_zero_entries():
    assert count_levels(["t INFO a"]) == {"INFO": 1}
    assert count_levels([]) == {}


def test_generator_input_consumed_once():
    calls = []

    def gen():
        for i in range(3):
            calls.append(i)
            yield f"t{i} WARN x"

    assert count_levels(gen()) == {"WARN": 3}
    assert calls == [0, 1, 2]


def test_large_input():
    lines = (f"t{i} {'INFO' if i % 3 else 'ERROR'} msg" for i in range(300_000))
    assert count_levels(lines) == {"INFO": 200_000, "ERROR": 100_000}


def test_input_not_mutated():
    lines = ["t INFO a", "t WARN b"]
    copy = list(lines)
    count_levels(lines)
    assert lines == copy
