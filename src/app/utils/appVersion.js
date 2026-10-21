export function parseVersion(version) {
    if (typeof version !== 'string' || !/^v?\d+(\.\d+)*$/.test(version)) return null;
    const parts = version.replace(/^v/, '').split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
}

export function compareVersions(current, previous) {
    const left = parseVersion(current), right = parseVersion(previous);
    if (!left || !right) return null;
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        if ((left[index] || 0) !== (right[index] || 0)) {
            return (left[index] || 0) > (right[index] || 0) ? 1 : -1;
        }
    }
    return 0;
}
