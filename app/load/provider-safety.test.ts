import assert from "node:assert/strict";
import test from "node:test";
import { assertNoProvider } from "./provider-safety";

test("concurrency probes require confirmed provider absence, not just a disabled surface", () => {
  assert.doesNotThrow(() => assertNoProvider(200, { enabled: false, providerConfigured: false }));
  for (const body of [null, [], "false", {}, { enabled: false },
    { enabled: false, providerConfigured: true }, { providerConfigured: "false" }, { providerConfigured: 0 }]) {
    assert.throws(() => assertNoProvider(200, body), /providerConfigured=false/);
  }
});

test("a failed, redirected or incomplete status check never authorises agent probes", () => {
  for (const status of [0, 201, 204, 301, 302, 307, 401, 403, 429, 500, 503]) {
    assert.throws(() => assertNoProvider(status, { providerConfigured: false }), /HTTP 200/);
  }
});
