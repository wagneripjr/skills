#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["typesafe-sdk==0.7.0"]
# ///
"""Per-method semantic signal detection with TypeSafe's Jev model.

Opt-in only: the farley-score skill runs this after the user consents to sending test
source to api.typesafe.ai. Each test method becomes one request carrying eight yes/no
(Noul) questions; code turns the answers into signal counts the calculator consumes.
Counting, thresholds and arithmetic stay here, never in the model.

Usage:
    uv run jev_judge.py methods.json            # judge every method, JSON to stdout
    uv run jev_judge.py --version

methods.json is a list of {file, line, name, framework, source, setup, imports}. `setup`
holds the fixtures and setup code the method depends on ("" when it has none); a method
without the key is escalated rather than judged blind.

Exit codes: 0 judged, 1 service failure, 2 bad input, 77 TYPESAFE_API_KEY not set.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True

MODEL = "jev-1.13.0"
YES = 0.5
UNSURE = (0.35, 0.65)
CONCURRENCY = 16

SIGNALS = {
    "production_code_drives_assertions": {
        "instructions": "Does `test_source` call a real (non-mock) function or method from the code under test, such that its assertions would fail if that production code did nothing? Assertions on how the real code called mocked collaborators count, because they depend on the production code running.",
        "criteria": {
            "true": "A real function or method from the code under test runs, and at least one assertion depends on what it returned, changed, or called",
            "false": "No real code under test runs, or no assertion depends on it: every assertion checks a mock the test itself drove, a literal, or language/library behaviour",
        },
        "fires_when": False,
        "label": "production_code_not_exercised",
        "effects": [("N", "neg"), ("M", "neg"), ("T", "neg")],
    },
    "mock_tautology": {
        "instructions": "Does `test_source` assert on a value that the test itself configured as a mock's return value, with no production code transforming that value in between?",
        "criteria": {
            "true": "The asserted value is the configured mock return value, passed straight through",
            "false": "No assertion checks a value the test configured on a mock, or production code computes the asserted value",
        },
        "fires_when": True,
        "effects": [("N", "neg"), ("M", "neg")],
    },
    "mock_only": {
        "instructions": "Is every object that `test_source` calls a mock or stub, with no real class from the code under test constructed or invoked (checking `setup_and_fixtures` too)?",
        "criteria": {
            "true": "Only mocks or stubs are called; nothing from the code under test runs",
            "false": "At least one real class or function from the code under test is constructed or invoked",
        },
        "fires_when": True,
        "effects": [("N", "neg"), ("M", "neg"), ("T", "neg")],
    },
    "framework_test": {
        "instructions": "Does `test_source` verify the behaviour of the programming language, its standard library, or a third-party framework, rather than of the application's own code?",
        "criteria": {
            "true": "The assertions would hold in any project, because they check built-in or library behaviour",
            "false": "The assertions check behaviour specific to the application's own code",
        },
        "fires_when": True,
        "effects": [("N", "neg")],
    },
    "over_specified_interactions": {
        "instructions": "Does `test_source` constrain how collaborators are called (exact call counts, call ordering, or that no other calls happened) where the requirement being tested does not demand that exact count or order?",
        "criteria": {
            "true": "It pins counts, ordering, or exhaustive interactions that a behaviour-preserving refactor could change",
            "false": "It makes no such constraint, or the exact count or order is itself the requirement (for example, charge the card exactly once); a plain check that a side effect happened is not over-specified",
        },
        "fires_when": True,
        "effects": [("M", "neg"), ("A", "neg")],
    },
    "inspects_internal_details": {
        "instructions": "Does `test_source` inspect internal details: fields of arguments captured from mocks, private attributes, or never-called checks that mirror the code's branches?",
        "criteria": {
            "true": "It asserts on captured-argument internals, private state, or branch-mirroring never-called expectations",
            "false": "It asserts only on outputs and observable effects through the public interface",
        },
        "fires_when": True,
        "effects": [("M", "neg"), ("U", "neg")],
    },
    "name_states_behaviour": {
        "instructions": "Does `test_name` state the behaviour or outcome being checked, rather than only naming the method or class under test?",
        "criteria": {
            "true": "The name says what should happen, under what condition, for example rejects_expired_card or should_apply_late_fee_after_due_date",
            "false": "The name only names the unit (test_quote, test_add), is generic (test_it_works), or is numbered",
        },
        "fires_when": True,
        "effects": [("U", "pos")],
    },
    "single_outcome": {
        "instructions": "Do all assertions in `test_source` verify one outcome? Several assertions describing the same result, such as a status and its body, count as one outcome.",
        "criteria": {
            "true": "One outcome is verified, possibly through a logical group of assertions",
            "false": "Two or more unrelated outcomes are verified in the same test",
        },
        "fires_when": True,
        "effects": [("G", "pos")],
    },
}

PROPERTIES = ["U", "M", "R", "A", "N", "G", "F", "T"]


def state_for(method):
    return {
        "test_name": method["name"],
        "test_source": method["source"],
        "setup_and_fixtures": method.get("setup", ""),
        "framework": method.get("framework", ""),
        "imports": method.get("imports", ""),
    }


def build_questions():
    return {
        key: {"type": "noul", "instructions": spec["instructions"], "criteria": spec["criteria"]}
        for key, spec in SIGNALS.items()
    }


def fired(nouls):
    return [key for key, spec in SIGNALS.items() if (nouls[key] > YES) == spec["fires_when"]]


def label(key):
    return SIGNALS[key].get("label", key)


def escalation_reasons(method, nouls):
    reasons = [f"{key} uncertain ({value:.2f})" for key, value in nouls.items() if UNSURE[0] <= value <= UNSURE[1]]
    if "setup" not in method:
        reasons.append("setup and fixtures not supplied")
    return reasons


def compose(methods, answers):
    """Turn per-method Noul answers into per-property signal counts.

    A property gains at most one negative and one positive per method, so the
    overlapping tautology questions cannot count the same defect three times.
    Escalated methods are left out of the counts: the host model judges them.
    """
    counts = {prop: {"neg_count": 0, "pos_count": 0} for prop in PROPERTIES}
    judged = []
    for method, nouls in zip(methods, answers):
        reasons = escalation_reasons(method, nouls)
        hits = fired(nouls)
        effects = sorted({effect for key in hits for effect in SIGNALS[key]["effects"]})
        if not reasons:
            for prop, polarity in effects:
                counts[prop][f"{polarity}_count"] += 1
        judged.append({
            "file": method.get("file"),
            "line": method.get("line"),
            "name": method["name"],
            "nouls": nouls,
            "fired": [label(key) for key in hits],
            "escalated": bool(reasons),
            "reasons": reasons,
        })
    return {
        "counts": counts,
        "judged_methods": sum(not m["escalated"] for m in judged),
        "escalated_methods": sum(m["escalated"] for m in judged),
        "methods": judged,
    }


def plugin_version():
    for parent in Path(__file__).resolve().parents:
        for host in (".claude-plugin", ".codex-plugin", ".tessl-plugin"):
            manifest = parent / host / "plugin.json"
            if manifest.is_file():
                return json.loads(manifest.read_text()).get("version", "unknown")
    return "unknown"


def load_methods(path):
    methods = json.loads(Path(path).read_text())
    if not isinstance(methods, list) or not methods:
        raise ValueError("expected a non-empty JSON list of test methods")
    for i, method in enumerate(methods):
        missing = [k for k in ("name", "source") if not isinstance(method.get(k), str) or not method[k]]
        if missing:
            raise ValueError(f"method {i} is missing {', '.join(missing)}")
    return methods


async def judge(methods):
    from typesafe_sdk import AsyncTypeSafeClient

    questions = build_questions()
    gate = asyncio.Semaphore(CONCURRENCY)
    async with AsyncTypeSafeClient(model=MODEL) as client:
        async def one(method):
            async with gate:
                response = await client.system_one(state=state_for(method), questions=questions)
                return response.model, {key: response.nouls[key].noul for key in questions}

        results = await asyncio.gather(*(one(m) for m in methods))
    return results[0][0], [nouls for _, nouls in results]


def main(argv):
    if argv[:1] == ["--version"]:
        print(f"jev_judge.py {plugin_version()} ({MODEL})")
        return 0
    if len(argv) != 1:
        print(json.dumps({"ok": False, "error": "usage: jev_judge.py <methods.json> | --version"}))
        return 2
    try:
        methods = load_methods(argv[0])
    except (OSError, ValueError) as e:
        print(json.dumps({"ok": False, "error": f"bad input: {e}"}))
        return 2
    if not os.environ.get("TYPESAFE_API_KEY"):
        print(json.dumps({"ok": False, "skipped": True, "error": "TYPESAFE_API_KEY is not set; fall back to the host-model signal read"}))
        return 77
    try:
        model, answers = asyncio.run(judge(methods))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"TypeSafe request failed: {type(e).__name__}: {e}"}))
        return 1
    print(json.dumps({"ok": True, "model": model, "total_methods": len(methods), **compose(methods, answers)}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
