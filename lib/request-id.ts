export function createRequestId() {
  return Math.random().toString(36).slice(2, 8);
}
