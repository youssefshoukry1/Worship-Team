'use client';
import { useSyncExternalStore } from 'react';
import { changeFriendship, readFriendship } from './friendshipActions';
import { invalidatePeoplePages } from './peoplePageCache';
import { friendsSummaryKey, invalidateTabRead } from './tabRequests';
import { getFriendDirectory } from './friendDirectory/useLocalFriends';

const sessions = new WeakMap();
const desired = { add: 'outgoing', accept: 'friends', cancel: 'none', remove: 'none' };

async function withDeadline(work) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try { return await work(controller.signal); }
  finally { clearTimeout(timer); }
}

function createActions(directory, token, userId) {
  let pending = new Map();
  const listeners = new Set();
  const publish = () => { for (const listener of listeners) listener(); };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => pending,
    async run(person, action, before) {
      const id = person._id;
      const epoch = directory.sessionVersion();
      if (epoch === null || pending.has(id)) return;
      const entry = { person, before, after: desired[action] };
      pending = new Map(pending).set(id, entry);
      publish();
      let revision = 0;
      const changed = event => {
        const actor = event.detail?.removedFriendId || event.detail?.friendChange?.person._id;
        if (!actor || actor === id) revision++;
      };
      window.addEventListener('taspe7:friends-push', changed);
      try {
        let after, failure;
        try {
          const result = await withDeadline(signal => changeFriendship(token, id, action, { optimisticRemoval: false, signal }));
          after = result.status === 'accepted' ? 'friends' : entry.after;
        } catch (error) {
          failure = error;
          after = error.relationship;
          if (!after && error.status && error.status < 500 && ![400, 404, 408, 409].includes(error.status)) throw error;
        }
        if (directory.sessionVersion() !== epoch) return;
        if (!after || revision) {
          // A dropped response may follow a committed write. Never repeat the write.
          let readRevision, attempts = 0;
          do {
            readRevision = revision;
            try {
              if (++attempts > 2) throw new Error('Relationship is still changing');
              after = await withDeadline(signal => readFriendship(token, id, { signal }));
            }
            catch {
              if (directory.sessionVersion() !== epoch) return;
              invalidatePeoplePages(token);
              invalidateTabRead(friendsSummaryKey(token, userId));
              throw new Error('Could not confirm the change. Reconnect to refresh your friends.');
            }
            if (directory.sessionVersion() !== epoch) return;
          } while (readRevision !== revision);
        }
        if (after !== before) {
          const accessChanged = after === 'friends' || before === 'friends';
          window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: {
            friendChange: { person, before, after }, notesHandled: !accessChanged,
            removedFriendId: before === 'friends' ? id : undefined,
          } }));
        }
        if (after !== entry.after && !(action === 'add' && after === 'friends')) {
          throw failure || new Error('The friendship changed. Your list has been refreshed.');
        }
        return after;
      } catch (error) {
        if (directory.sessionVersion() === epoch) throw error;
      } finally {
        window.removeEventListener('taspe7:friends-push', changed);
        pending = new Map(pending);
        pending.delete(id);
        publish();
      }
    },
  };
}

export function useFriendActions(token, userId) {
  const directory = getFriendDirectory(token, userId);
  if (!sessions.has(directory)) sessions.set(directory, createActions(directory, token, userId));
  const actions = sessions.get(directory);
  const pending = useSyncExternalStore(actions.subscribe, actions.snapshot, actions.snapshot);
  return { pending, actions };
}
