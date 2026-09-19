import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'ys-token';

// Emulator + device defaults: Android emulator reaches host via 10.0.2.2,
// iOS simulator via localhost, physical device via LAN IP set in env.
// Priority: EXPO_PUBLIC_API_URL env > app.json extra.apiUrl > platform default.
// For a physical phone on the same Wi-Fi, start with:
//   EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:4000 npx expo start --lan
function defaultBase(): string {
  const extra = (Constants.expoConfig?.extra ?? (Constants as any).manifest2?.extra ?? {}) as any;
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (extra.apiUrl) return extra.apiUrl;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_BASE: string = defaultBase();
if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log(`[api] Using API_BASE = ${API_BASE}`);
}

let memToken: string | null = null;
export async function getToken(): Promise<string | null> {
  if (memToken) return memToken;
  try {
    memToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memToken = null;
  }
  return memToken;
}
export async function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((opts.headers as any) || {}) };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers, signal: ctrl.signal as any });
    clearTimeout(timer);
  } catch (e: any) {
    throw new ApiError(
      `Cannot reach API at ${API_BASE}${path}. Is the backend running (npm run dev) and is EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:4000 set for a physical device? (${e?.message || 'network error'})`,
      0,
      'NETWORK_UNREACHABLE'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || data?.message || `Request failed (${res.status})`, res.status, data?.code);
  return data as T;
}
