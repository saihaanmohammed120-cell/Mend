/** Bundled illustration only. Nothing in this module represents a provider run. */
export const BEFORE_SOURCE = [
  "def average_sales(values):",
  "    # Empty-input guard missing",
  "",
  "    total = sum(values)",
  "    return total / len(values)",
].join("\n");

export const AFTER_SOURCE = [
  "def average_sales(values):",
  "    if not values:",
  "        return 0",
  "    total = sum(values)",
  "    return total / len(values)",
].join("\n");

export const SAMPLE_CHECKS = Object.freeze([
  "test_empty_input_returns_zero",
  "test_single_sale",
  "test_multiple_sales",
  "test_zero_sales",
  "test_negative_sales",
  "test_decimal_sales",
] as const);

export const REGRESSION_SOURCE = `import unittest
from sales import average_sales


class AverageSalesTests(unittest.TestCase):
    def test_empty_input_returns_zero(self):
        self.assertEqual(average_sales([]), 0)

    def test_single_sale(self):
        self.assertEqual(average_sales([12]), 12)

    def test_multiple_sales(self):
        self.assertEqual(average_sales([10, 20, 30]), 20)

    def test_zero_sales(self):
        self.assertEqual(average_sales([0, 0]), 0)

    def test_negative_sales(self):
        self.assertEqual(average_sales([-10, -20]), -15)

    def test_decimal_sales(self):
        self.assertAlmostEqual(average_sales([1.5, 2.5]), 2.0)


if __name__ == "__main__":
    unittest.main()
`;

export const SAMPLE_PHASES = Object.freeze([
  { label: "Check fails", detail: "Illustrative failure: empty input reaches division by zero.", code: BEFORE_SOURCE, log: "Example only · test_empty_input_returns_zero\nZeroDivisionError: division by zero", duration: 2800 },
  { label: "Patch lands", detail: "An early return handles the empty list before dividing.", code: AFTER_SOURCE, log: "Illustrative patch · sales.py\n+ if not values:\n+     return 0", duration: 2600 },
  { label: "Sample checks pass", detail: "Illustrated outcome for the bundled checks; no job was executed.", code: AFTER_SOURCE, log: "Expected sample outcome · six named checks\nPass illustration — not a live test result", duration: 2600 },
  { label: "Receipt prints", detail: "A sample receipt records the patch and names its evidence source.", code: AFTER_SOURCE, log: "Sample receipt prepared\nsource: demo · execution: not_run", duration: 3600 },
] as const);

/** Keep empty lines: filtering them drops the blank third line in the failed example. */
export function numberedSource(source: string) {
  return source.split("\n").map((text, index) => ({ number: index + 1, text }));
}

export function createSampleBundle() {
  return {
    source: "demo" as const,
    execution: "not_run" as const,
    title: "Mend illustrative empty-input repair",
    explanation: "The original function divides by the input length. An empty list has length zero. The patch returns zero before division; the regression test protects that behavior.",
    files: {
      before: { "sales.py": BEFORE_SOURCE },
      after: { "sales.py": AFTER_SOURCE },
      tests: { "test_sales.py": REGRESSION_SOURCE },
    },
    receipt: {
      source: "demo" as const,
      execution: "not_run" as const,
      checks: [...SAMPLE_CHECKS],
      result: "illustrative_only" as const,
      notice: "Bundled example. No inference, isolated job, or live verification was performed.",
    },
  };
}
