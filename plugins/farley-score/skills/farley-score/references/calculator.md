# The calculator

All arithmetic goes through `scripts/cli_calculator.py`, a stdlib-only Python 3.10+ CLI. It takes JSON in and gives JSON out. A score computed in prose varies from run to run. A score computed by this script can be reproduced and checked.

```bash
CALC="<skill-dir>/scripts/cli_calculator.py"

python3 "$CALC" --version
python3 "$CALC" normalize-property '{"prop":"U","neg_count":2,"pos_count":8,"total_methods":20}'
python3 "$CALC" blend-scores '{"static_score":7.5,"llm_score":8.0}'
python3 "$CALC" compute-farley '{"U":8,"M":7,"R":9,"A":8,"N":6,"G":8,"F":9,"T":7}'
python3 "$CALC" get-rating '{"farley_index":7.8}'
python3 "$CALC" aggregate-file '{"method_scores":[{"U":8,"M":7},{"U":6,"M":9}]}'
python3 "$CALC" aggregate-suite '{"file_scores":[{"U":8,"M":7,"R":9,"A":8,"N":6,"G":8,"F":9,"T":7}],"file_locs":[120]}'
python3 "$CALC" full-pipeline '{"properties":{"U":{"neg_count":2,"pos_count":15,"total_methods":20},"M":{"neg_count":3,"pos_count":10,"total_methods":20},"R":{"neg_count":1,"pos_count":18,"total_methods":20},"A":{"neg_count":0,"pos_count":12,"total_methods":20},"N":{"neg_count":4,"pos_count":8,"total_methods":20},"G":{"neg_count":1,"pos_count":16,"total_methods":20},"F":{"neg_count":0,"pos_count":18,"total_methods":20},"T":{"neg_count":2,"pos_count":10,"total_methods":20}},"llm_scores":{"U":8.0,"M":7.5,"R":9.0,"A":8.5,"N":6.5,"G":8.0,"F":9.0,"T":7.0}}'
```

`<skill-dir>` is the directory holding this skill's `SKILL.md`. Resolve it to an absolute path before running anything. Never search `~/.claude/plugins` for the script: that finds whichever copy happens to be installed, which may be the wrong one.

`full-pipeline` is the normal entry point. It normalizes each property's signal counts, blends them with the LLM scores when you supply them, and returns `static_scores`, `blended_scores`, `weighted_scores` (for the report's Weighted column), `farley_index` and `rating` in a single call.

## Contract

- Success prints `{"ok": true, "result": {...}}` on stdout and exits 0.
- A missing field, bad JSON or an unknown command prints `{"ok": false, "error": "..."}` on stdout and exits 1.
- A calculation error prints the same envelope on **stderr** and exits 1. One example is `aggregate-suite` given a different number of `file_scores` and `file_locs`: the old code silently truncated the longer list, and now it refuses.

## Formulas it applies

- Property: sigmoid normalization of the negative and positive signal densities. Each property has its own midpoint and steepness (`DEFAULT_SIGMOID_PARAMS` in `scoring.py`).
- Base score: a property with no signals scores **5.0**. No signal means quality is unknown, not that it is good.
- Blend: `0.60 * static + 0.40 * llm`.
- Index: `(U*1.5 + M*1.5 + R*1.25 + A*1.0 + N*1.0 + G*1.0 + F*0.75 + T*1.0) / 9.0`. The divisor is the sum of the weights (9.0), not the number of properties (8).

## A documented gap

The scoring knowledge says a file aggregates its methods with the mean of positive signals and the **90th percentile** of negative ones. The CLI's `aggregate-file` computes a plain mean per property. `aggregate_file_split` implements the P90 rule but the CLI does not expose it. Its `{neg, pos}` output is not a shape `aggregate-suite` accepts, so wiring it in would be new methodology, not a port. Report aggregation as the mean. Do not describe it as P90.
