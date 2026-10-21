const tasks = new Map();

// Mutating sync jobs run to completion across tab unmounts. A push arriving
// during a job queues one more pass, using the latest caller's task.
export function runSessionTask(key, task, { force = false } = {}) {
  const active = tasks.get(key);
  if (active) {
    if (force) active.next = task;
    return active.promise;
  }
  const job = { next: null };
  tasks.set(key, job);
  job.promise = Promise.resolve().then(async () => {
    let next = task;
    do {
      job.next = null;
      await next();
      next = job.next;
    } while (next);
  }).finally(() => tasks.delete(key));
  return job.promise;
}
