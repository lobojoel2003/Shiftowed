import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom does not provide these; the app only uses them for nice-to-have features.
if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

(globalThis as unknown as { __BUILD_INFO__: unknown }).__BUILD_INFO__ = {
  version: "0.0.0-test",
  build: "test",
  commit: "test",
  date: "2026-01-01T00:00:00.000Z",
  channel: "test",
};
