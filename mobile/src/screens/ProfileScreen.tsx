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
  const [pastTrips, setPastTrips] = useState<any[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  useEffect(() => {
    api('/api/auth/firebase-config', {}, false).then(setFb).catch(() => setFb({ adminConfigured: false }));
    if (user?.preferences?.interests) setPrefs((user.preferences.interests as string[]).join(', '));
    if (user?.preferences?.budget) setBudget(String(user.preferences.budget));
  }, []);

  useEffect(() => {
    const loadPast = async () => {
      try {
        setTripsLoading(true);
        const trips: any = await api('/api/trips/mine');
        const now = new Date();
        const past = (Array.isArray(trips) ? trips : []).filter((t: any) => {
          if (t.status === 'CANCELLED') return false;
          const end = new Date(t.endDate);
          return t.status === 'COMPLETED' || end < now;
        });
        setPastTrips(past);
      } catch {
        setPastTrips([]);
      } finally {
        setTripsLoading(false);
      }
    };
    loadPast();
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
      <Text style={s.h1}>Profile</Text>
      <Text style={s.api}>API: {API_BASE}</Text>

      <View style={s.card}>
        <Text style={s.heading}>Name</Text>
        <Text style={s.nameVal}>{user?.name || '—'}</Text>
        <Text style={s.sub}>{user?.email} · {user?.role}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.heading}>Past Trips</Text>
        {tripsLoading ? (
          <Text style={s.line}>Loading past trips…</Text>
        ) : pastTrips.length === 0 ? (
          <Text style={s.line}>No past trips yet — confirmed trips will appear here after completion.</Text>
        ) : (
          pastTrips.map((t: any) => (
            <View key={t.id} style={s.tripRow}>
              <Text style={s.tripName}>{t.spot?.name || 'Trip'} · {t.status}</Text>
              <Text style={s.line}>{String(t.startDate).slice(0, 10)} → {String(t.endDate).slice(0, 10)}{t.totalAmount ? ` · ₹${Number(t.totalAmount).toLocaleString('en-IN')}` : ''}</Text>
            </View>
          ))
        )}
      </View>

      <View style={s.card}>
        <Text style={s.heading}>Location Type Preference</Text>
        <Text style={s.small}>e.g. beach, hill station, heritage — drives personalised picks on Discover.</Text>
        <TextInput style={s.input} placeholder="Interests: beach, hill station…" value={prefs} onChangeText={setPrefs} />
      </View>

      <View style={s.card}>
        <Text style={s.heading}>General Budget</Text>
        <Text style={s.small}>Used as the default budget when planning and recommending hotels.</Text>
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
  heading: { fontSize: 15, fontWeight: '800', color: theme.tealDark, marginBottom: 4 },
  nameVal: { fontSize: 19, fontWeight: '800', color: theme.ink },
  tripRow: { borderTopWidth: 1, borderTopColor: theme.line, marginTop: 8, paddingTop: 8 },
  tripName: { fontWeight: '800', color: theme.ink, fontSize: 13 },
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
