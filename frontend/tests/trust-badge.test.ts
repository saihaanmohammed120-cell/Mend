import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrustBadge } from "../components/trust-badge";

test("No evidence produces four unavailable slots and no overall pass seal", () => {
  for (const scope of ["task", "captured"] as const) {
    const html = renderToStaticMarkup(createElement(TrustBadge, { scope }));
    assert.equal((html.match(/data-trust="unavailable"/g) ?? []).length, 4);
    assert.ok(!html.includes('data-trust="pass"'));
    assert.ok(html.includes("not an overall verification seal"));
  }
});
test("Actual captured-file check can affect only its own hash slot", () => {
  for (const hashes of ["pass", "fail"] as const) {
    const html = renderToStaticMarkup(createElement(TrustBadge, { scope: "captured", hashes }));
    assert.equal((html.match(new RegExp(`data-trust="${hashes}"`, "g")) ?? []).length, 1);
    assert.equal((html.match(/data-trust="unavailable"/g) ?? []).length, 3);
    assert.ok(html.includes("Captured example only · not live execution."));
  }
});
