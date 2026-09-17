import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Image, TextInput, ScrollView, Alert } from 'react-native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';
import { useAuth } from '../lib/auth';

const TYPE_COLORS: Record<string, string> = {
  Historical: '#8b5e34',
  Beach: '#0284c7',
  'Hill Station': '#15803d',
};

function overlaps(a: any, b: any) {
  const s1 = new Date(a.startDate).getTime();
  const e1 = new Date(a.endDate).getTime();
  const s2 = new Date(b.startDate).getTime();
  const e2 = new Date(b.endDate).getTime();
  return s1 <= e2 && s2 <= e1;
}

function findClashes(trips: any[]) {
  const clashes: string[] = [];
  for (let i = 0; i < trips.length; i++) {
    for (let j = i + 1; j < trips.length; j++) {
      if (overlaps(trips[i], trips[j])) {
        clashes.push(`${trips[i].spot?.name || 'Trip'} (${String(trips[i].startDate).slice(0, 10)}→${String(trips[i].endDate).slice(0, 10)}) clashes with ${trips[j].spot?.name || 'Trip'} (${String(trips[j].startDate).slice(0, 10)}→${String(trips[j].endDate).slice(0, 10)})`);
      }
    }
  }
  return clashes;
}

export default function DiscoverScreen({ navigation }: any) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [trips, setTrips] = useState<any[]>([]);
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  const [guideReason, setGuideReason] = useState('');
  const [guideFormFor, setGuideFormFor] = useState<string | null>(null);
  const [sendingReq, setSendingReq] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      let spots: any[] = [];
      try {
        const d: any = await api('/api/spots/featured/list', {}, false);
        spots = d.items || [];
      } catch {
        const d: any = await api('/api/spots?featured=true&limit=10', {}, false);
        spots = d.items || [];
      }
      setItems(spots);
      try {
        const t: any = await api('/api/trips/mine');
        setTrips(Array.isArray(t) ? t : []);
      } catch {
        setTrips([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = q
    ? items.filter((i) => `${i.name} ${i.city} ${i.state} ${i.placeType}`.toLowerCase().includes(q.toLowerCase()))
    : items;

  const now = new Date();
  const upcoming = trips
    .filter((t: any) => t.status === 'CONFIRMED' && new Date(t.endDate) >= now)
    .sort((a: any, b: any) => +new Date(a.startDate) - +new Date(b.startDate));
  const clashes = findClashes(upcoming);
  // Guide appears on home only after booking is over (CONFIRMED booking with guide).
  const bookedGuides = upcoming.filter((t: any) => t.guide);

  const sendGuideChange = async (bookingId: string) => {
    if (!guideReason.trim() || guideReason.trim().length < 5) {
      Alert.alert('Add a reason', 'Please write at least 5 characters so the admin can review.');
      return;
    }
    try {
      setSendingReq(true);
      await api('/api/requests/guide-change', {
        method: 'POST',
        body: JSON.stringify({ bookingId, reason: guideReason.trim() }),
      });
      setGuideReason('');
      setGuideFormFor(null);
      Alert.alert('Sent', 'Guide change request sent to the admin.');
    } catch (e: any) {
      Alert.alert('Request failed', e.message);
    } finally {
      setSendingReq(false);
    }
  };

  const cancelTrip = async (id: string) => {
    Alert.alert('Cancel trip?', 'This will remove the trip from Upcoming journeys and My trips.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel trip',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/api/trips/${id}/cancel`, { method: 'PUT' });
            Alert.alert('Cancelled', 'Trip cancelled.');
            load();
          } catch (e: any) { Alert.alert('Cancel failed', e.message); }
        },
      },
    ]);
  };

  return (
    <Screen padded={false}>
    <ScrollView
      style={s.scroll}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Hero — old dashboard banner */}
      <View style={s.hero}>
        <Text style={s.eyebrow}>A LITTLE INSPIRATION FOR YOU</Text>
        <Text style={s.h1}>Where will your next story take you?</Text>
        <Text style={s.tagline}>YatraSetu · Your Bridge to a Safer Journey{user ? ` · Namaste, ${user.name.split(' ')[0]} 👋` : ''}</Text>
        <View style={s.searchBar}>
          <TextInput style={s.searchInput} placeholder="Search Jaipur, Goa, Manali…" value={q} onChangeText={setQ} placeholderTextColor={theme.muted} />
          <View style={s.searchBtn}>
            <Text style={s.searchBtnT}>Search</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <>
          {/* Handpicked cards with photos — tap a place for weather/AQI/crowd + hotels */}
          <View style={s.rowBetween}>
            <Text style={s.h2}>Handpicked for your vibe</Text>
            <Text style={s.count}>{filtered.length} places</Text>
          </View>
          {filtered.map((item) => (
            <Pressable key={item.id} style={s.card} onPress={() => navigation.navigate('SpotDetail', { id: item.id, name: item.name })}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={s.img} /> : <View style={[s.img, s.imgFallback]} />}
              <View style={[s.badge, { backgroundColor: TYPE_COLORS[item.placeType] || theme.teal }]}>
                <Text style={s.badgeT}>{item.placeType || 'Place'}</Text>
              </View>
              <Text style={s.name}>{item.name}, {item.state}</Text>
              <Text style={s.desc} numberOfLines={2}>{item.description}</Text>
              <View style={s.foot}>
                <Text style={s.stars}>★ {(item.safetyScore / 20 + 3).toFixed(1)}</Text>
                <Text style={s.price}>from ₹{Number(item.averageCost).toLocaleString('en-IN')}/day</Text>
              </View>
              {item.cheapestHotel && (
                <Text style={s.hotel}>Stay from ₹{Number(item.cheapestHotel.pricePerNight).toLocaleString('en-IN')}/night · {item.cheapestHotel.name}</Text>
              )}
              <Text style={s.tapHint}>Tap for weather · AQI · crowd · hotels →</Text>
            </Pressable>
          ))}
          {filtered.length === 0 && <Text style={s.empty}>No places match "{q}".</Text>}

          {/* Upcoming journeys — every CONFIRMED future trip, expandable day plan */}
          <Text style={s.h2}>Your upcoming journeys</Text>
          {clashes.length > 0 && (
            <View style={s.clashBox}>
              <Text style={s.clashH}>⚠ A plan in that particular duration is already confirmed.</Text>
              {clashes.map((c, i) => <Text key={i} style={s.clashT}>• {c}</Text>)}
            </View>
          )}
          {upcoming.length === 0 ? (
            <Pressable style={s.tripCard} onPress={() => navigation.navigate('Planner', { spotId: items[0]?.id || '', spotName: items[0]?.name || '' })}>
              <View style={{ flex: 1 }}>
                <Text style={s.tripTitle}>No trip yet — build your day-wise plan</Text>
                <Text style={s.tripSub}>Book a trip and it will appear here with its day-wise plan.</Text>
              </View>
            </Pressable>
          ) : (
            upcoming.map((trip: any) => (
              <View key={trip.id} style={s.tripCard}>
                <Pressable
                  style={s.tripHead}
                  onPress={() => setOpenTrip(openTrip === trip.id ? null : trip.id)}
                >
                  <View style={s.dayBadge}>
                    <Text style={s.dayNum}>{String(trip.startDate).slice(8, 10)}</Text>
                    <Text style={s.dayMon}>{String(trip.startDate).slice(5, 7)}/{String(trip.startDate).slice(0, 4)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tripTitle}>{trip.spot?.name} journey {openTrip === trip.id ? '▲' : '▼'}</Text>
                    <Text style={s.tripSub}>{String(trip.startDate).slice(0, 10)} → {String(trip.endDate).slice(0, 10)} · ₹{Number(trip.budget).toLocaleString('en-IN')} budget · {trip.status}</Text>
                    {trip.hotel && <Text style={s.tripSub}>Hotel: {trip.hotel.name}</Text>}
                  </View>
                </Pressable>
                {openTrip === trip.id && (
                  <View style={s.planBox}>
                    {(trip.itinerary?.roadmap || []).length === 0 && (
                      <Text style={s.tripSub}>Day-wise plan will appear here once planned.</Text>
                    )}
                    {(trip.itinerary?.roadmap || []).map((d: any) => (
                      <View key={d.day} style={s.planDay}>
                        <Text style={s.planDayH}>Day {d.day} · {d.date || ''} — {d.dayTitle || d.title || ''}</Text>
                        {(d.slots || []).map((sl: any, i: number) => (
                          <Text key={i} style={s.slotT}>• {sl.time} — {sl.activity} ({sl.mode} · ~₹{sl.spend})</Text>
                        ))}
                        {d.note ? <Text style={s.slotReason}>{d.note}</Text> : null}
                        {d.reason ? <Text style={s.slotReason}>{d.reason}</Text> : null}
                      </View>
                    ))}
                  </View>
                )}
                <Pressable style={s.cancelBtn} onPress={() => cancelTrip(trip.id)}>
                  <Text style={s.cancelBtnT}>Cancel trip</Text>
                </Pressable>
              </View>
            ))
          )}

          {/* Guide — only after booking is confirmed */}
          {bookedGuides.length > 0 && (
            <>
              <Text style={s.h2}>Meet your local guide</Text>
              {bookedGuides.map((t: any) => (
                <View key={t.id} style={s.guideCard}>
                  <Text style={s.guideHead}>{t.spot?.name} · Registry-approved & ready for your trip</Text>
                  <Text style={s.guideName}>{t.guide.user?.name || 'Guide'} ✓</Text>
                  <Text style={s.guideSub}>₹{t.agreedRate || t.guide.officialDailyRate}/day · {(t.guide.languages || []).join(', ')}</Text>
                  <Text style={s.verified}>YATRASETU REGISTRY · CONFIRMED BOOKING</Text>
                  {guideFormFor === t.id ? (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        style={s.guideInput}
                        placeholder="Reason for changing guide (min 5 chars)…"
                        value={guideReason}
                        onChangeText={setGuideReason}
                        multiline
                      />
                      <View style={s.guideBtnRow}>
                        <Pressable style={s.guideSend} onPress={() => sendGuideChange(t.id)} disabled={sendingReq}>
                          <Text style={s.guideSendT}>{sendingReq ? 'Sending…' : 'Send request'}</Text>
                        </Pressable>
                        <Pressable style={s.guideCancel} onPress={() => { setGuideFormFor(null); setGuideReason(''); }}>
                          <Text style={s.guideCancelT}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable style={s.guideBtn} onPress={() => setGuideFormFor(t.id)}>
                      <Text style={s.guideBtnT}>Request guide change</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper },
  scroll: { flex: 1 },
  hero: { backgroundColor: theme.tealDark, padding: 20, paddingTop: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  eyebrow: { color: '#8fe1d7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  h1: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  tagline: { color: 'rgba(255,255,255,.85)', fontSize: 12, marginTop: 4 },
  searchBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginTop: 14, padding: 6, alignItems: 'center' },
  searchInput: { flex: 1, padding: 8, fontSize: 13, color: theme.ink },
  searchBtn: { backgroundColor: theme.coral, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 14 },
  searchBtnT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  h2: { fontSize: 17, fontWeight: '800', color: theme.ink, marginTop: 18, marginHorizontal: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginRight: 16 },
  count: { fontSize: 11, color: theme.muted, marginTop: 18 },
  card: { backgroundColor: '#fff', borderRadius: 15, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: theme.line, overflow: 'hidden', paddingBottom: 12 },
  img: { height: 150, width: '100%' },
  imgFallback: { backgroundColor: theme.line },
  badge: { position: 'absolute', top: 12, left: 12, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9 },
  badgeT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  name: { fontWeight: '800', color: theme.ink, fontSize: 15, marginTop: 10, marginHorizontal: 12 },
  desc: { color: theme.muted, fontSize: 12, marginTop: 3, marginHorizontal: 12, lineHeight: 17 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginHorizontal: 12 },
  stars: { color: '#e6a23d', fontWeight: '800', fontSize: 12 },
  price: { color: theme.muted, fontSize: 12 },
  hotel: { fontSize: 12, color: theme.ok, fontWeight: '700', marginTop: 4, marginHorizontal: 12 },
  tapHint: { fontSize: 11, color: theme.teal, fontWeight: '700', marginTop: 6, marginHorizontal: 12 },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 20 },
  tripCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: theme.line, padding: 14 },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayBadge: { backgroundColor: theme.teal, borderRadius: 12, width: 64, height: 64, justifyContent: 'center', alignItems: 'center' },
  dayNum: { color: '#fff', fontSize: 20, fontWeight: '800' },
  dayMon: { color: '#fff', fontSize: 10 },
  tripTitle: { fontWeight: '800', color: theme.ink, fontSize: 14 },
  tripSub: { fontSize: 11, color: theme.muted, marginTop: 3 },
  planBox: { marginTop: 10, backgroundColor: theme.paper, borderRadius: 10, padding: 10 },
  planDay: { marginTop: 8 },
  planDayH: { fontWeight: '800', color: theme.tealDark, fontSize: 12 },
  slotT: { fontSize: 12, color: theme.ink, marginTop: 3 },
  slotReason: { fontSize: 11, color: theme.muted, marginTop: 2 },
  cancelBtn: { marginTop: 10, borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: '#fff' },
  cancelBtnT: { color: theme.danger, fontWeight: '800', fontSize: 12 },
  clashBox: { backgroundColor: '#fdecec', borderRadius: 12, marginHorizontal: 16, marginTop: 10, padding: 12, borderWidth: 1, borderColor: '#f5c2c2' },
  clashH: { fontWeight: '800', color: theme.danger, fontSize: 13 },
  clashT: { fontSize: 11, color: theme.danger, marginTop: 4 },
  guideCard: { backgroundColor: theme.tealDark, borderRadius: 16, marginHorizontal: 16, marginTop: 10, padding: 16 },
  guideHead: { color: '#fff', fontSize: 13, fontWeight: '800' },
  guideName: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 10 },
  guideSub: { color: 'rgba(255,255,255,.75)', fontSize: 11, marginTop: 3 },
  verified: { color: '#8fe1d7', fontSize: 10, fontWeight: '800', marginTop: 6 },
  guideBtn: { marginTop: 10, backgroundColor: '#fff', borderRadius: 10, padding: 11, alignItems: 'center' },
  guideBtnT: { color: theme.tealDark, fontWeight: '800', fontSize: 12 },
  guideInput: { backgroundColor: '#fff', borderRadius: 10, padding: 10, fontSize: 12, minHeight: 60, textAlignVertical: 'top' },
  guideBtnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  guideSend: { flex: 1, backgroundColor: theme.coral, borderRadius: 10, padding: 11, alignItems: 'center' },
  guideSendT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  guideCancel: { flex: 1, backgroundColor: 'rgba(255,255,255,.2)', borderRadius: 10, padding: 11, alignItems: 'center' },
  guideCancelT: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
