import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useAuth } from '../lib/auth';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

export default function AuthScreen() {
  const { signIn, register, signInWithFirebaseToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('traveller@example.com');
  const [password, setPassword] = useState('');
  const [idToken, setIdToken] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    try {
      setBusy(true);
      if (mode === 'login') await signIn(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      Alert.alert('Sign-in failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const firebaseGo = async () => {
    try {
      setBusy(true);
      if (!idToken.trim()) throw new Error('Paste a Firebase ID token (Google sign-in via web, then user.getIdToken()).');
      await signInWithFirebaseToken(idToken.trim());
    } catch (e: any) {
      Alert.alert('Firebase failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false}>
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.brand}>YatraSetu</Text>
      <Text style={s.sub}>Your bridge to a safer journey.</Text>
      <View style={s.card}>
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
        <Text style={s.div}>— or continue with Firebase —</Text>
        <TextInput style={s.input} placeholder="Firebase ID token (Google / phone)" value={idToken} onChangeText={setIdToken} multiline />
        <Pressable style={s.ghost} onPress={firebaseGo} disabled={busy}>
          <Text style={s.ghostT}>Link Firebase token</Text>
        </Pressable>
        <Text style={s.hint}>Same email = same account across password + Firebase. Demo: traveller@example.com / DemoPass123!</Text>
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
