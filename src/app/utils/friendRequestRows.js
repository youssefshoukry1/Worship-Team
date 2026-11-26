export function affectsPeoplePage(path, change) {
  if (!change) return true;
  if (path.startsWith('friend-requests?kind=')) {
    // A crossed add can consume an incoming request absent from the local list.
    if (change.before === 'none' && change.after === 'friends') return true;
    const kind = path.slice('friend-requests?kind='.length);
    return kind === change.before || kind === change.after;
  }
  if (path.startsWith('testimonies/profile/')) return change.before === 'friends' || change.after === 'friends';
  return true;
}

export function projectRequestRows(items, kind, change) {
  const field = kind === 'incoming' ? 'from' : 'to';
  const exists = items.some(row => (row[field]?._id || row[field]) === change.person._id);
  if (change.after === kind) {
    if (exists) return items;
    return [{ _id: 'local-' + change.person._id, localRequest: true, [field]: change.person }, ...items];
  }
  return exists ? items.filter(row => (row[field]?._id || row[field]) !== change.person._id) : items;
}
