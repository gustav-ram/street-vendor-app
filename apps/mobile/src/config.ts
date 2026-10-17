import Constants from 'expo-constants';

export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:4000',
).replace(/\/$/, '');
