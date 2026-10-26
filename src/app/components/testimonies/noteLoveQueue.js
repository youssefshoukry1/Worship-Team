import { testimonyRequest } from './testimonyApi';

// Keep saves outside the reader so closing a note does not cancel its reaction.
// Requests for the same user/note run in order; rapid taps share the latest intent.
export function createNoteLoveQueue(send) {
  const jobs = new Map();
  const listeners = new Map();
  const keyFor = (userId, id) => `${userId}:${id}`;
  const snapshot = job => ({ loved: job.desired, loveCount: Math.max(0, job.confirmed.loveCount + Number(job.desired) - Number(job.confirmed.loved)) });
  const publish = job => {
    const current = listeners.get(job.key);
    const callbacks = current?.size ? new Set([...current].map(listener => listener.onUpdate)) : new Set([job.onUpdate]);
    for (const update of callbacks) update(job.id, snapshot(job));
  };
  const save = async job => {
    try {
      while (job.desired !== job.confirmed.loved) {
        const desired = job.desired;
        try {
          const result = await send(job.token, `/${job.id}/love`, { method: desired ? 'PUT' : 'DELETE', keepalive: true });
          job.confirmed = result.reaction;
          publish(job);
        } catch (error) {
          job.desired = job.confirmed.loved;
          publish(job);
          for (const listener of listeners.get(job.key) || []) listener.onError(error);
          break;
        }
      }
    } finally { jobs.delete(job.key); }
  };
  return {
    pending(userId, id) {
      const job = jobs.get(keyFor(userId, id));
      return job ? snapshot(job) : null;
    },
    toggle({ item, userId, token, onUpdate }) {
      const key = keyFor(userId, item._id);
      let job = jobs.get(key);
      const existing = Boolean(job);
      if (!job) {
        job = { key, id: item._id, token, onUpdate, confirmed: { loved: Boolean(item.loved), loveCount: item.loveCount || 0 }, desired: Boolean(item.loved) };
        jobs.set(key, job);
      }
      job.token = token; job.onUpdate = onUpdate;
      job.desired = !job.desired;
      publish(job);
      if (!existing) void save(job);
    },
    subscribe(userId, id, listener) {
      const key = keyFor(userId, id);
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      const job = jobs.get(key);
      if (job) { job.onUpdate = listener.onUpdate; listener.onUpdate(id, snapshot(job)); }
      return () => {
        const current = listeners.get(key);
        current?.delete(listener);
        if (!current?.size) listeners.delete(key);
      };
    },
  };
}

export const noteLoveQueue = createNoteLoveQueue(testimonyRequest);
