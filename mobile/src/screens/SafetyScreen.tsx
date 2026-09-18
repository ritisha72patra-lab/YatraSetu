import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, FlatList, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

function km(a: any, b: any): string | null {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(s))).toFixed(1);
}

// Optional real map (react-native-maps works in Expo Go). Falls back to a
// lightweight custom map below when the package isn't installed.
let RNMapView: any = null;
let RNMarker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('react-native-maps');
  RNMapView = m.default || m.MapView;
  RNMarker = m.Marker;
} catch {
  RNMapView = null;
}

function LiveMap({ me, guideLoc, guideNote }: { me: any; guideLoc: any; guideNote: string }) {
  if (!me) {
    return (
      <View style={s.mapFallback}>
        <Text style={s.mapPlaceholder}>Tap “Locate me” to show your live map.</Text>
      </View>
    );
  }
  if (RNMapView && RNMarker) {
    const region = {
      latitude: guideLoc ? (me.latitude + guideLoc.latitude) / 2 : me.latitude,
      longitude: guideLoc ? (me.longitude + guideLoc.longitude) / 2 : me.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    return (
      <View style={s.mapBox}>
        <RNMapView style={s.map} initialRegion={region} region={region}>
          <RNMarker coordinate={{ latitude: me.latitude, longitude: me.longitude }} title="You" pinColor="#1a7fe0" />
          {guideLoc ? (
            <RNMarker coordinate={{ latitude: Number(guideLoc.latitude), longitude: Number(guideLoc.longitude) }} title="Guide" pinColor="#ed5b43" />
          ) : null}
        </RNMapView>
        {!guideLoc ? <Text style={s.mapWarn}>Guide location isn't available right now. {guideNote}</Text> : null}
      </View>
    );
  }
  // Fallback custom map — no native dependency, works on any system.
  const pts = [me, guideLoc].filter(Boolean);
  const lats = pts.map((p: any) => Number(p.latitude));
  const lons = pts.map((p: any) => Number(p.longitude));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = Math.max(0.001, maxLat - minLat);
  const spanLon = Math.max(0.001, maxLon - minLon);
  const toXY = (p: any) => ({
    // 12%..88% so dots never sit on the border
    left: `${12 + ((Number(p.longitude) - minLon) / spanLon) * 76}%` as any,
    top: `${12 + (1 - (Number(p.latitude) - minLat) / spanLat) * 76}%` as any,
  });
  const meXY = toXY(me);
  const guideXY = guideLoc ? toXY(guideLoc) : null;
  return (
    <View style={s.mapBox}>
      <View style={s.mapFallback}>
        <Text style={s.mapGrid}>MAP · live positions</Text>
        <View style={[s.mapDot, s.mapDotMe, { left: meXY.left, top: meXY.top }]} />
        <View style={[s.mapTag, { left: meXY.left, top: meXY.top }]}>
          <Text style={s.mapTagT}>You</Text>
        </View>
        {guideLoc && guideXY ? (
          <>
            <View style={[s.mapDot, s.mapDotGuide, { left: guideXY.left, top: guideXY.top }]} />
            <View style={[s.mapTag, { left: guideXY.left, top: guideXY.top }]}>
              <Text style={s.mapTagT}>Guide</Text>
            </View>
          </>
        ) : null}
      </View>
      {!guideLoc ? (
        <Text style={s.mapWarn}>Guide location isn't available right now. {guideNote}</Text>
      ) : (
        <Text style={s.mapOk}>Showing you + guide on the live map.</Text>
      )}
    </View>
  );
}

export default function SafetyScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [help, setHelp] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [guideLoc, setGuideLoc] = useState<any>(null);
  const [guideName, setGuideName] = useState('');
  const [guideNote, setGuideNote] = useState('Finding your guide…');
  const [me, setMe] = useState<any>(null);
  const [sharing, setSharing] = useState(false);

  const loadGuide = async () => {
    try {
      const trips: any = await api('/api/trips/mine');
      const t = (trips || []).find((x: any) => x.status === 'CONFIRMED' && x.guide) || (trips || []).find((x: any) => x.guide);
      if (!t?.guide?.id) {
        setGuideNote('No guide on your trips yet — confirm a trip to see live guide GPS.');
        return;
      }
      setGuideName(t.guide.user?.name || 'Your guide');
      const g: any = await api(`/api/location/guide/${t.guide.id}`);
      setGuideLoc(g);
      setGuideNote(`${g.guide?.name || 'Guide'} · updated ${new Date(g.updatedAt).toLocaleTimeString()}`);
    } catch (e: any) {
      setGuideNote(e?.status === 403 || e?.status === 404 ? 'Guide is not sharing live GPS right now.' : e.message);
      setGuideLoc(null);
    }
  };

  const locateMe = async (share: boolean) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location blocked', 'Allow location access to see yourself and share with the control room.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pt = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setMe({ ...pt, updatedAt: new Date().toISOString() });
      if (share) {
        await api('/api/location/tourist', { method: 'POST', body: JSON.stringify(pt) });
        setSharing(true);
      }
    } catch (e: any) {
      Alert.alert('Location failed', e.message);
    }
  };

  const stopSharing = async () => {
    try {
      await api('/api/location/tourist', { method: 'DELETE' });
    } catch {}
    setSharing(false);
  };

  const load = async () => {
    try {
      setRefreshing(true);
      setAlerts(await api('/api/safety/alerts/mine'));
      try {
        setHelp(await api('/api/safety/helplines', {}, false));
      } catch {}
      await loadGuide();
      if (sharing) await locateMe(true);
      else {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
            setMe({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, updatedAt: new Date().toISOString() });
          }
        } catch {}
      }
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    } finally {
      setRefreshing(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const sos = async () => {
    try {
      const body: any = { type: 'SOS', message: msg || 'Need help' };
      if (me) {
        body.latitude = me.latitude;
        body.longitude = me.longitude;
      }
      const r: any = await api('/api/safety/alerts', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('SOS sent', `${r.ticket} — ${r.message}`);
      setMsg('');
      load();
    } catch (e: any) {
      Alert.alert('SOS failed', e.message);
    }
  };

  const dist = km(me, guideLoc);

  return (
    <Screen>
      <Text style={s.h1}>Live safety</Text>
      <FlatList
        data={alerts}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            <View style={s.liveCard}>
              <Text style={s.liveH}>📍 Guide + you · live</Text>
              <View style={s.pinRow}>
                <View style={[s.dot, { backgroundColor: '#ed5b43' }]} />
                <Text style={s.pinT}>{guideName || 'Guide'}: {guideLoc ? `${Number(guideLoc.latitude).toFixed(4)}, ${Number(guideLoc.longitude).toFixed(4)}` : guideNote}</Text>
              </View>
              <View style={s.pinRow}>
                <View style={[s.dot, { backgroundColor: '#1a7fe0' }]} />
                <Text style={s.pinT}>You: {me ? `${Number(me.latitude).toFixed(4)}, ${Number(me.longitude).toFixed(4)}` : 'tap below to locate'}</Text>
              </View>
              {dist && <Text style={s.dist}>Distance between you: ~{dist} km</Text>}
              <LiveMap me={me} guideLoc={guideLoc} guideNote={guideNote} />
              <View style={s.btnRow}>
                <Pressable style={s.locBtn} onPress={() => locateMe(false)}><Text style={s.locBtnT}>◎ Locate me</Text></Pressable>
                {sharing ? (
                  <Pressable style={s.stopBtn} onPress={stopSharing}><Text style={s.stopBtnT}>● Sharing — stop</Text></Pressable>
                ) : (
                  <Pressable style={s.shareBtn} onPress={() => locateMe(true)}><Text style={s.shareBtnT}>Share live location</Text></Pressable>
                )}
              </View>
              <Pressable style={s.refreshBtn} onPress={loadGuide}><Text style={s.refreshBtnT}>↻ Refresh guide GPS</Text></Pressable>
            </View>
            <View style={s.sosCard}>
              <Text style={s.sosH}>Emergency? Send SOS to the control room</Text>
              <TextInput style={s.input} placeholder="What is happening? (optional)" value={msg} onChangeText={setMsg} />
              <Pressable style={s.sos} onPress={sos}><Text style={s.sosT}>Send SOS now{me ? ' (with my GPS)' : ''}</Text></Pressable>
            </View>
            {help && <Text style={s.help}>Helplines: {(help.helplines || []).map((h: any) => `${h.label} ${h.number}`).join(' · ')}</Text>}
            <Text style={s.histH}>SOS history</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.t}>{item.type} · {item.resolved ? 'resolved' : 'active'} · {String(item.createdAt).slice(0, 16).replace('T', ' ')}</Text>
            {item.message ? <Text style={s.c}>{item.message}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No SOS history.</Text>}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: theme.ink },
  liveCard: { backgroundColor: theme.tealDark, borderRadius: 16, padding: 14, marginTop: 10 },
  liveH: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  pinT: { color: '#fff', fontSize: 12, flex: 1 },
  dist: { color: '#8fe1d7', fontSize: 12, fontWeight: '800', marginTop: 8 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  locBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 11, alignItems: 'center' },
  locBtnT: { color: theme.tealDark, fontWeight: '800', fontSize: 12 },
  shareBtn: { flex: 1, backgroundColor: theme.coral, borderRadius: 10, padding: 11, alignItems: 'center' },
  shareBtnT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  stopBtn: { flex: 1, backgroundColor: '#c0362c', borderRadius: 10, padding: 11, alignItems: 'center' },
  stopBtnT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  refreshBtn: { marginTop: 8, alignItems: 'center', padding: 6 },
  refreshBtnT: { color: '#8fe1d7', fontSize: 11, fontWeight: '700' },
  mapBox: { marginTop: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e8f1f0' },
  map: { width: '100%', height: 220 },
  mapFallback: { width: '100%', height: 220, backgroundColor: '#e8f1f0', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.4)', justifyContent: 'center', alignItems: 'center' },
  mapGrid: { position: 'absolute', top: 8, fontSize: 10, fontWeight: '800', color: '#5b7a7d', letterSpacing: 1 },
  mapDot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff', marginLeft: -8, marginTop: -8 },
  mapDotMe: { backgroundColor: '#1a7fe0' },
  mapDotGuide: { backgroundColor: '#ed5b43' },
  mapTag: { position: 'absolute', marginLeft: -14, marginTop: 12, backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  mapTagT: { fontSize: 10, fontWeight: '800', color: theme.tealDark },
  mapPlaceholder: { color: '#41666a', fontSize: 12, fontWeight: '700', paddingHorizontal: 20, textAlign: 'center' },
  mapWarn: { backgroundColor: '#fff4d9', color: '#7a5b00', fontSize: 11, fontWeight: '700', padding: 8, textAlign: 'center' },
  mapOk: { backgroundColor: '#e2f7ec', color: theme.ok, fontSize: 11, fontWeight: '700', padding: 8, textAlign: 'center' },
  sosCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: theme.line },
  sosH: { fontWeight: '800', color: theme.danger },
  input: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: '#fff' },
  sos: { backgroundColor: theme.danger, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  sosT: { color: '#fff', fontWeight: '800' },
  help: { fontSize: 11, color: theme.muted, marginTop: 8, lineHeight: 16 },
  histH: { fontSize: 15, fontWeight: '800', color: theme.ink, marginTop: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: theme.line },
  t: { fontWeight: '800', color: theme.ink, fontSize: 12 },
  c: { marginTop: 4, fontSize: 13 },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 20 },
});
