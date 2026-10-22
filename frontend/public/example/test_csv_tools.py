import unittest
from csv_tools import clean_rows


class CsvChecks(unittest.TestCase):
    def test_empty_input(self):
        self.assertEqual(clean_rows([]), ([], 0))

    def test_duplicate_rows(self):
        row = {"name": "Mira", "age": "20"}
        self.assertEqual(clean_rows([row, dict(row)]), ([row], 0))

    def test_missing_values(self):
        rows = [{"name": "", "age": "20"}, {"name": "Mira", "age": None}]
        self.assertEqual(clean_rows(rows), (rows, 2))

    def test_field_order(self):
        rows = [{"name": "Mira", "age": "20"}, {"name": "Ravi", "age": "21"}]
        cleaned, _ = clean_rows(rows)
        self.assertEqual([tuple(row) for row in cleaned], [("name", "age"), ("name", "age")])
        with self.assertRaises(ValueError):
            clean_rows([rows[0], {"age": "20", "name": "Mira"}])


if __name__ == "__main__":
    unittest.main()
