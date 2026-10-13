/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.wasla.wasla',
  appName: 'Wasla',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    CapacitorUpdater: {
      autoUpdate: false,
      directUpdate: false
    }
  }
};

module.exports = config;