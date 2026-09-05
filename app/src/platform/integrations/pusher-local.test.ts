import assert from "node:assert/strict";
import test from "node:test";
import { localPusherEndpoint } from "./pusher-local";

test("hosted Pusher retains TLS and plain transport is restricted to loopback", () => {
  assert.equal(localPusherEndpoint(undefined, undefined), null);
  assert.deepEqual(localPusherEndpoint("127.0.0.1", "6001"), { host: "127.0.0.1", port: 6001 });
  for (const host of ["api.pusherapp.com", "localhost.evil.test", "127.0.0.1@evil.test", "https://localhost"]) {
    assert.throws(() => localPusherEndpoint(host, "6001"));
  }
  for (const port of [undefined, "", "0", "70000", "NaN", "6001/path"]) {
    assert.throws(() => localPusherEndpoint("localhost", port));
  }
});
