// Stub for `server-only` / `client-only` so server modules can be imported in
// the Vitest (Node) environment. These packages throw at import time outside an
// RSC build; we replace them with an empty module for tests.
export {};
