/** Parse a standards-shaped SSE response without assuming network chunks end
 * on event boundaries. `data:` may span several lines and CRLF is accepted. */
export async function readServerSentEvents<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void | Promise<void>,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const normalised = buffer.replace(/\r\n/g, "\n");
    const frames = normalised.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data || data === "[DONE]") continue;
      await onEvent(JSON.parse(data) as T);
    }

    if (done) break;
  }

  const trailing = buffer.trim();
  if (trailing) {
    const data = trailing
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data && data !== "[DONE]") await onEvent(JSON.parse(data) as T);
  }
}
