# Mend CSV example

This is a captured local Python example, not a live model call or Nebius job. `captured-run.json` records the literal before/after unittest output, UTC capture times and checked source/test hashes. The before version removes the empty-input guard; `repair.diff` adds it back. This is a curated patch, not evidence of model-generated repair or receipt signing.

Run the named checks after extracting the bundle:

```sh
python -m unittest -v test_csv_tools
```

The function accepts an in-memory list of dictionaries with consistent field order and hashable values. It removes duplicate rows, preserves field order, and counts missing cells (`None` or empty strings) in retained rows. Empty input returns `([], 0)`.

Checks: `test_empty_input`, `test_duplicate_rows`, `test_missing_values`, and `test_field_order`.

Large files, streaming input, malformed CSV parsing, and production deployment are outside these example checks. Passing the suite is not universal correctness.
