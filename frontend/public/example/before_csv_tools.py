def clean_rows(rows):
    fields = tuple(rows[0])
    cleaned = []
    seen = set()
    missing = 0
    for row in rows:
        if tuple(row) != fields:
            raise ValueError("Rows must share the same fields and field order")
        key = tuple(row[field] for field in fields)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(dict(row))
        missing += sum(value is None or value == "" for value in key)
    return cleaned, missing
