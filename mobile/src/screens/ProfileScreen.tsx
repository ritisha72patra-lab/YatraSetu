import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { api, API_BASE } from '../lib/api';
import { Screen } from '../lib/Screen';
import { useAuth } from '../lib/auth';
import { theme } from '../theme';

export default function ProfileScreen() {
  const { user, signOut, refreshMe } = useAuth();
  const [prefs, setPrefs] = useState('beach, heritage');
  const [budget, setBudget] = useState('20000');
  const [fb, setFb] = useState<any>(null);

  useEffect(() => {
    api('/api/auth/firebase-config', {}, false).then(setFb).catch(() => setFb({ adminConfigured: false }));
    if (user?.preferences?.interests) setPrefs((user.preferences.interests as string[]).join(', '));
  }, []);

  const save = async () => {
    try {
      await api('/api/auth/me/preferences', {
        method: 'PUT',
        body: JSON.stringify({ interests: prefs.split(',').map((s) => s.trim()).filter(Boolean), budget: Number(budget) || undefined }),
      });
      await refreshMe();
      Alert.alert('Saved', 'Preferences drive personalised picks on Discover.');
    } catch (e: any) { Alert.alert('Save failed', e.message); }
  };

  return (
    <Screen padded={false}>
    <ScrollView style={s.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.h1}>{user?.name}</Text>
      <Text style={s.sub}>{user?.email} · {user?.role}</Text>
      <Text style={s.api}>API: {API_BASE}</Text>
      <View style={s.card}>
        <Text style={s.cardH}>Travel preferences (personalised itinerary)</Text>
        <TextInput style={s.input} placeholder="Interests: beach, hill station…" value={prefs} onChangeText={setPrefs} />
        <TextInput style={s.input} placeholder="Budget ₹" keyboardType="numeric" value={budget} onChangeText={setBudget} />
        <Pressable style={s.primary} onPress={save}><Text style={s.primaryT}>Save preferences</Text></Pressable>
      </View>
      <View style={s.card}>
        <Text style={s.cardH}>Firebase</Text>
        <Text style={s.line}>Admin bridge: {fb ? String(fb.adminConfigured) : '…'} · Project: {fb?.projectId || '—'}</Text>
        <Text style={s.small}>Google/phone login links to this same email. If adminConfigured is false, ask the admin to set FIREBASE_SERVICE_ACCOUNT_JSON.</Text>
      </View>
      <Pressable style={s.ghost} onPress={signOut}><Text style={s.ghostT}>Sign out</Text></Pressable>
    </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper, padding: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: theme.ink },
  sub: { color: theme.muted },
  api: { fontSize: 11, color: theme.muted, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: theme.line },
  cardH: { fontWeight: '800', color: theme.tealDark },
  input: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, marginTop: 8 },
  primary: { backgroundColor: theme.teal, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghost: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12, backgroundColor: '#fff' },
  ghostT: { color: theme.danger, fontWeight: '800' },
  line: { fontSize: 12, marginTop: 6 },
  small: { fontSize: 11, color: theme.muted, marginTop: 6, lineHeight: 16 },
});
