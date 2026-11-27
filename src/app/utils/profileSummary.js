import { fetchTabJson, readTabResource, tabReadKey } from './tabRequests';

const storageKey = owner => `profile_summary_v1_${owner}`;

export function readProfileSummary(owner) {
  try {
    const summary = JSON.parse(localStorage.getItem(storageKey(owner)));
    return summary?.user?._id === owner ? summary : null;
  } catch {
    return null;
  }
}

export function saveProfileSummary(owner, summary) {
  if (summary?.user?._id !== owner) return;
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(summary));
  } catch {
    // Private browsing and storage quotas can disable offline persistence.
  }
}

export function refreshProfileSummary(apiBase, token, owner) {
  const url = `${apiBase}/users/profile-summary`;
  return readTabResource(tabReadKey(url, token), async signal => {
    const summary = await fetchTabJson(url, token, signal);
    if (summary?.user?._id !== owner || !Number.isInteger(summary.counts?.notes)
        || !Number.isInteger(summary.counts?.highlights)) throw new Error('Invalid profile summary');
    return summary;
  }, { onSuccess: summary => saveProfileSummary(owner, summary) });
}
