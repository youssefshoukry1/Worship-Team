import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wasla.wasla',
  appName: 'Wasla',
  webDir: 'out',
  server: {
    androidScheme: 'https' // بيساعد في تلافي مشاكل الـ CORS والروابط المحلية في الأندرويد
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      statsUrl: 'https://capgo.app/api/stats',
      directUpdate: false // بينزل التحديث في الخلفية ويطبقه عند فتح التطبيق من جديد من غير ما يفصل على المستخدم فجأة
    }
  }
};

export default config;