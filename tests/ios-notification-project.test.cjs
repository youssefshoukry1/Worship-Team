const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const plist = require('plist');
const root = path.join(__dirname, '../ios/App');
const objects = xcode.project(path.join(root, 'App.xcodeproj/project.pbxproj')).parseSync().hash.project.objects;
const entries = section => Object.entries(objects[section]).filter(([, value]) => typeof value === 'object');
const app = entries('PBXNativeTarget').find(([, target]) => target.name === 'App');
const extension = entries('PBXNativeTarget').find(([, target]) => target.name === 'PrayerNotificationService');
const readPlist = file => plist.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function targetFiles(target, phaseType) {
  const phase = target.buildPhases.find(ref => objects[phaseType]?.[ref.value]);
  return objects[phaseType][phase.value].files.map(ref => objects.PBXBuildFile[ref.value]);
}
test('the main application embeds and depends on the notification extension', () => {
  assert.ok(app); assert.ok(extension);
  assert.ok(app[1].dependencies.some(ref => objects.PBXTargetDependency[ref.value].target === extension[0]));
  const embed = app[1].buildPhases.find(ref => objects.PBXCopyFilesBuildPhase?.[ref.value]);
  const phase = objects.PBXCopyFilesBuildPhase[embed.value];
  assert.equal(phase.dstSubfolderSpec, 13);
  assert.equal(objects.PBXBuildFile[phase.files[0].value].fileRef, extension[1].productReference);
  assert.ok(targetFiles(extension[1], 'PBXSourcesBuildPhase').some(file => objects.PBXFileReference[file.fileRef]?.path === 'NotificationService.swift'));
});
test('Firebase configuration and token bridge are included in the main app', () => {
  assert.ok(targetFiles(app[1], 'PBXSourcesBuildPhase').some(file => objects.PBXFileReference[file.fileRef]?.path === 'PrayerBridgeViewController.swift'));
  assert.ok(targetFiles(app[1], 'PBXResourcesBuildPhase').some(file => objects.PBXFileReference[file.fileRef]?.path === 'GoogleService-Info.plist'));
  const frameworks = targetFiles(app[1], 'PBXFrameworksBuildPhase').map(file => objects.XCSwiftPackageProductDependency[file.productRef]?.productName);
  assert.ok(frameworks.includes('FirebaseCore')); assert.ok(frameworks.includes('FirebaseMessaging'));
  const firebase = readPlist('App/GoogleService-Info.plist');
  assert.equal(firebase.BUNDLE_ID, 'com.wasla.wasla'); assert.equal(firebase.PROJECT_ID, 'wasla-569f0');
});
test('push/communication entitlements and extension identifiers are configured', () => {
  const main = readPlist('App/App.entitlements');
  assert.equal(main['aps-environment'], '$(APS_ENVIRONMENT)');
  assert.equal(main['com.apple.developer.usernotifications.communication'], true);
  assert.equal(readPlist('PrayerNotificationService/PrayerNotificationService.entitlements')['com.apple.developer.usernotifications.communication'], true);
  const appInfo = readPlist('App/Info.plist');
  assert.deepEqual(appInfo.NSUserActivityTypes, ['INSendMessageIntent']); assert.equal(appInfo.FirebaseAppDelegateProxyEnabled, false);
  const info = readPlist('PrayerNotificationService/Info.plist');
  assert.equal(info.NSExtension.NSExtensionPointIdentifier, 'com.apple.usernotifications.service');
  assert.equal(info.NSExtension.NSExtensionPrincipalClass, '$(PRODUCT_MODULE_NAME).NotificationService');
  const configs = objects.XCConfigurationList[app[1].buildConfigurationList].buildConfigurations.map(ref => objects.XCBuildConfiguration[ref.value]);
  assert.equal(configs.find(config => config.name === 'Debug').buildSettings.APS_ENVIRONMENT, 'development');
  assert.equal(configs.find(config => config.name === 'Release').buildSettings.APS_ENVIRONMENT, 'production');
});
test('extension build inputs and main custom bridge exist on disk', () => {
  assert.ok(fs.readFileSync(path.join(root, 'App/Base.lproj/Main.storyboard'), 'utf8').includes('customClass="PrayerBridgeViewController"'));
  for (const target of [app[1], extension[1]]) {
    const config = objects.XCBuildConfiguration[objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations[0].value].buildSettings;
    assert.ok(fs.existsSync(path.join(root, config.INFOPLIST_FILE)));
    assert.ok(fs.existsSync(path.join(root, config.CODE_SIGN_ENTITLEMENTS)));
  }
  for (const file of ['App/PrayerBridgeViewController.swift', 'PrayerNotificationService/NotificationService.swift']) assert.ok(fs.existsSync(path.join(root, file)));
});

test('SwiftPM paths remain portable when synchronizing from Windows', () => {
  const { normalizePackagePaths } = require('../scripts/sync-ios.cjs');
  const original = 'path: "..' + String.fromCharCode(92) + 'node_modules' + String.fromCharCode(92) + '@capacitor' + String.fromCharCode(92) + 'core"';
  assert.equal(normalizePackagePaths(original), 'path: "../node_modules/@capacitor/core"');
  const packageFile = path.join(root, 'CapApp-SPM/Package.swift');
  for (const match of fs.readFileSync(packageFile, 'utf8').matchAll(/path:\s*"([^"]+)"/g)) {
    assert.equal(match[1].includes(String.fromCharCode(92)), false);
    assert.ok(fs.existsSync(path.resolve(path.dirname(packageFile), match[1])));
  }
});
