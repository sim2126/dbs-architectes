/** Plain HTTP/WebSocket transport is available only for a loopback test broker. */
export function localPusherEndpoint(host: string | undefined, port: string | undefined) {
  if (!host) return null;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) ||
      !port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("The local Pusher endpoint requires a loopback host and a valid port.");
  }
  return { host, port: Number(port) };
}
