import { friendsSummaryKey, invalidateTabRead } from './tabRequests';

import { affectsPeoplePage, projectRequestRows } from './friendRequestRows';
export { affectsPeoplePage } from './friendRequestRows';

export const peopleStores = new Map();
const handledEvents = new WeakSet();

export function invalidatePeoplePages(token) {
  for (const entry of peopleStores.values()) if (entry.token === token) entry.store.invalidate();
}
export function handlePeoplePush(event, token, userId) {
  if (handledEvents.has(event)) return;
  handledEvents.add(event);
  invalidateTabRead(friendsSummaryKey(token, userId));
  const change = event.detail?.friendChange;
  for (const entry of peopleStores.values()) {
    if (entry.token !== token || !affectsPeoplePage(entry.path, change)) continue;
    entry.store.invalidate();
    if (!change) continue;
    if (entry.path.startsWith('friend-requests?kind=')) {
      const kind = entry.path.slice('friend-requests?kind='.length);
      entry.store.setItems(items => projectRequestRows(items, kind, change), Number(change.after === kind) - Number(change.before === kind));
    } else if (entry.path.startsWith('people-search?')) {
      entry.store.setItems(items => items.map(person => person._id === change.person._id ? { ...person, relationship: change.after } : person));
    } else if (entry.path === 'friend-suggestions' && change.after !== 'none') {
      entry.store.setItems(items => items.filter(person => person._id !== change.person._id));
    }
  }
}
