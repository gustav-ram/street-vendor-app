import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';

// One .env at the repo root serves the API, web and mobile apps.
function rootEnv(): Record<string, string> {
  const file = path.resolve(__dirname, '../../.env');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^["']|["']$/g, '')]),
  );
}

const env = rootEnv();

const config: ExpoConfig = {
  name: 'StreetEats',
  slug: 'streeteats',
  scheme: 'streeteats',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'dev.streeteats.app',
  },
  android: {
    package: 'dev.streeteats.app',
    adaptiveIcon: {
      backgroundColor: '#FFFAF3',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  plugins: ['expo-router', 'expo-status-bar', 'expo-localization', 'expo-sqlite'],
  experiments: { typedRoutes: true },
  extra: {
    // The iOS Simulator shares the Mac's network, so localhost reaches the API.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  },
};

export default config;
