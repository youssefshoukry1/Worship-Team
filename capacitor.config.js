/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.wasla.wasla',
  appName: 'Wasla',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    NativePurchases: { autoFinishTransactions: false },
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
