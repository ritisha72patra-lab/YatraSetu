import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useAuth } from '../lib/auth';
import { getFirebaseAuthClient } from '../lib/firebase';
import { notify } from '../lib/notify';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { signIn, register, signInWithFirebaseToken, demoLogin } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('traveller@example.com');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<'traveller' | 'admin' | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params?.id_token) {
      handleGoogleIdToken(response.params.id_token);
    } else if (response?.type === 'error') {
      notify('Google sign-in failed', response.error?.message || 'Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handleGoogleIdToken = async (googleIdToken: string) => {
    try {
      setGoogleBusy(true);
      const authClient = await getFirebaseAuthClient();
      const credential = GoogleAuthProvider.credential(googleIdToken);
      const result = await signInWithCredential(authClient, credential);
      const firebaseIdToken = await result.user.getIdToken();
      await signInWithFirebaseToken(firebaseIdToken);
    } catch (e: any) {
      notify('Google sign-in failed', e.message || 'Please try again.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async () => {
    try {
      setBusy(true);
      if (mode === 'login') await signIn(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      notify('Sign-in failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async (role: 'traveller' | 'admin') => {
    try {
      setDemoBusy(role);
      await demoLogin(role);
    } catch (e: any) {
      notify('Demo login failed', e.message);
    } finally {
      setDemoBusy(null);
    }
  };

  return (
    <Screen padded={false}>
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.brand}>Panthan</Text>
      <Text style={s.sub}>Your bridge to a safer journey.</Text>
      <View style={s.card}>
        <View style={s.demoRow}>
          <Pressable style={s.demoBtn} onPress={() => handleDemo('traveller')} disabled={demoBusy !== null}>
            <Text style={s.demoBtnT}>{demoBusy === 'traveller' ? 'Entering…' : '🧳 Demo Traveller'}</Text>
          </Pressable>
          <Pressable style={s.demoBtn} onPress={() => handleDemo('admin')} disabled={demoBusy !== null}>
            <Text style={s.demoBtnT}>{demoBusy === 'admin' ? 'Entering…' : '🛠️ Demo Admin'}</Text>
          </Pressable>
        </View>
        <Text style={s.div}>— or sign in normally —</Text>
        <View style={s.tabs}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[s.tab, mode === m && s.tabOn]}>
              <Text style={[s.tabT, mode === m && s.tabTOn]}>{m === 'login' ? 'Sign in' : 'Register'}</Text>
            </Pressable>
          ))}
        </View>
        {mode === 'register' && (
          <TextInput style={s.input} placeholder="Full name" value={name} onChangeText={setName} />
        )}
        <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password (8+ chars)" secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable style={s.primary} onPress={submit} disabled={busy}>
          <Text style={s.primaryT}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Text>
        </Pressable>
        <Text style={s.div}>— or —</Text>
        <Pressable
          style={s.ghost}
          onPress={() => promptAsync()}
          disabled={!request || googleBusy}
        >
          <Text style={s.ghostT}>{googleBusy ? 'Signing in…' : 'Continue with Google'}</Text>
        </Pressable>
        <Text style={s.hint}>Same email = same account across password + Google sign-in. Demo: traveller@example.com / DemoPass123!</Text>
      </View>
    </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 20, backgroundColor: theme.paper, flexGrow: 1, justifyContent: 'center' },
  brand: { fontSize: 32, fontWeight: '800', color: theme.tealDark, textAlign: 'center' },
  sub: { textAlign: 'center', color: theme.muted, marginBottom: 16 },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.line },
  demoRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  demoBtn: { flex: 1, backgroundColor: theme.tealDark, borderRadius: 10, padding: 12, alignItems: 'center' },
  demoBtnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: theme.paper, alignItems: 'center' },
  tabOn: { backgroundColor: theme.teal },
  tabT: { fontWeight: '700', color: theme.muted },
  tabTOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  primary: { backgroundColor: theme.teal, borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghost: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 12, alignItems: 'center' },
  ghostT: { color: theme.teal, fontWeight: '700' },
  div: { textAlign: 'center', color: theme.muted, marginVertical: 12, fontSize: 12 },
  hint: { color: theme.muted, fontSize: 11, marginTop: 10, lineHeight: 16 },
});
