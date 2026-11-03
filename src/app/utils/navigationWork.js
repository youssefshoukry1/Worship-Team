// Data parsing and publishing wait while a finger owns the page transition.
let releaseWaiters = null;
let pending = null;
export function holdNavigationWork() {
  if (!pending) pending = new Promise(resolve => { releaseWaiters = resolve; });
}
export function releaseNavigationWork() {
  const resolve = releaseWaiters;
  pending = null;
  releaseWaiters = null;
  resolve?.();
}
export async function waitForNavigationIdle() {
  while (pending) await pending;
}
