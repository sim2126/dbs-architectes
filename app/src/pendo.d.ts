interface Pendo {
  track(event: string, properties?: Record<string, unknown>): void;
}

interface Window {
  pendo?: Pendo;
}
