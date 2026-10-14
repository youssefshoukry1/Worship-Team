const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Capacitor on Windows emits backslashes in Swift string literals. SwiftPM on
// macOS needs POSIX paths, and backslashes can also turn into Swift escape codes.
function normalizePackagePaths(source) {
    return source.replace(/path:\s*"([^"]+)"/g, (_, value) => `path: "${value.replaceAll('\\', '/')}"`);
}

if (require.main === module) {
    const result = spawnSync(process.execPath, [require.resolve('@capacitor/cli/bin/capacitor'), 'sync', 'ios'], {
        cwd: path.resolve(__dirname, '..'), stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    const file = path.resolve(__dirname, '../ios/App/CapApp-SPM/Package.swift');
    fs.writeFileSync(file, normalizePackagePaths(fs.readFileSync(file, 'utf8')));
}

module.exports = { normalizePackagePaths };
