import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ionic.tastebyte',
  appName: 'TasteByte',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    hostname: 'tastebyte.app',
  },
};

export default config;
