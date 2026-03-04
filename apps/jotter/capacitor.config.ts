import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "live.jotter.app",
  appName: "Jotter",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    GoogleSignIn: {
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      clientId: "669755857434-qvta604cln191dmgqh4pnvb9snd6dvq9.apps.googleusercontent.com",
    },
  },
};

export default config;
