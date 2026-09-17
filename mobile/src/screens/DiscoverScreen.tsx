import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Image, TextInput, ScrollView } from 'react-native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';
import { useAuth } from '../lib/auth';

const TYPE_COLORS: Record<string, string> = {
  Historical: '#8b5e34',
  Beach: '#0284c7',
  'Hill Station': '#15803d',
};

function Meter({ value, label, sub, status, warn }: { value: string; label: string; sub: string; status: string; warn?: boolean }) {
  return (
    <View style={s.metric}>
      <View style={s.meter}><Text style={s.meterT}>{value}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.metricB}>{label}</Text>
        <Text style={s.metricS}>{sub}</Text>
      </View>
      <Text style={[s.status, warn && s.statusWarn]}>{status}</Text>
    </View>
  );
}

export default function DiscoverScreen({ navigation }: any) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [env, setEnv] = useState<any>(null);
  const [trip, setTrip] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);

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
      if (spots.length) {
        const s0 = spots[0];
        try {
          setEnv(await api(`/api/spots/environment?latitude=${s0.latitude}&longitude=${s0.longitude}`, {}, false));
        } catch {}
        try {
          const g: any = await api(`/api/spots/${s0.id}/guides`, {}, false);
          const list = g.guides || [];
          setGuide(list.find((x: any) => x.availableOnDate) || list[0] || null);
        } catch {}
      }
      try {
        const trips: any = await api('/api/trips/mine');
        setTrip((trips || []).find((t: any) => t.status === 'CONFIRMED') || trips[0] || null);
      } catch {
        setTrip(null);
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
  const hero = items[0];
  const crowd = Number(hero?.liveCrowd ?? 3);
  const crowdPct = Math.round((crowd / 5) * 100);

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
          <Pressable style={s.searchBtn} onPress={() => navigation.navigate('Planner', { spotId: filtered[0]?.id || '', spotName: filtered[0]?.name || '' })}>
            <Text style={s.searchBtnT}>Let's plan →</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <>
          {/* Handpicked cards with photos */}
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
            </Pressable>
          ))}
          {filtered.length === 0 && <Text style={s.empty}>No places match "{q}".</Text>}

          {/* Travel intelligence */}
          {hero && (
            <View style={s.panel}>
              <View style={s.rowBetween}>
                <Text style={s.h2}>Travel intelligence</Text>
                <Text style={s.live}>● LIVE</Text>
              </View>
              <Meter value={`${crowdPct}%`} label={`${hero.name} crowd forecast`} sub={`${crowd >= 4 ? 'High' : crowd >= 3 ? 'Moderate' : 'Easy'} · Best visit: ${hero.bestVisitTime || '8–10 AM'}`} status={crowd >= 4 ? 'Expect rush' : crowd >= 3 ? 'Plan ahead' : 'Easy going'} warn={crowd === 3} />
              <Meter value={env ? String(env.aqi) : '–'} label={`${hero.name} air quality`} sub={env ? `${env.aqiLabel || 'Good'} · ${env.weather || ''} · ${env.temperature || ''}°C` : 'Live AQI'} status={env && Number(env.aqi) > 100 ? 'Take care' : 'Healthy'} warn={env && Number(env.aqi) > 100} />
              <Meter value={`${hero.safetyScore}%`} label={`${hero.name} safety score`} sub={`Verified routes in ${hero.state} · SOS support`} status={hero.safetyScore >= 85 ? 'Safe' : 'Mostly safe'} />
            </View>
          )}

          {/* Upcoming journey */}
          <Text style={s.h2}>Your upcoming journey</Text>
          {trip ? (
            <Pressable style={s.tripCard} onPress={() => navigation.navigate('Planner', { spotId: trip.spotId, spotName: trip.spot?.name })}>
              <View style={s.dayBadge}>
                <Text style={s.dayNum}>{String(trip.startDate).slice(8, 10)}</Text>
                <Text style={s.dayMon}>{String(trip.startDate).slice(5, 7)}/{String(trip.startDate).slice(0, 4)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tripTitle}>{trip.spot?.name} discovery</Text>
                <Text style={s.tripSub}>{String(trip.startDate).slice(0, 10)} → {String(trip.endDate).slice(0, 10)} · ₹{Number(trip.budget).toLocaleString('en-IN')} budget · {trip.status}</Text>
                {trip.hotel && <Text style={s.tripSub}>Hotel: {trip.hotel.name}</Text>}
              </View>
            </Pressable>
          ) : (
            <Pressable style={s.tripCard} onPress={() => navigation.navigate('Planner', { spotId: items[0]?.id || '', spotName: items[0]?.name || '' })}>
              <View style={{ flex: 1 }}>
                <Text style={s.tripTitle}>No trip yet — build your day-wise plan</Text>
                <Text style={s.tripSub}>Timed itinerary: breakfast → attractions → sunset → dinner → hotel</Text>
              </View>
            </Pressable>
          )}

          {/* Guide */}
          {guide && (
            <>
              <Text style={s.h2}>Meet your local guide</Text>
              <View style={s.guideCard}>
                <Text style={s.guideHead}>Registry-approved & ready for your trip</Text>
                <Text style={s.guideName}>{guide.guideName} ✓</Text>
                <Text style={s.guideSub}>★ {guide.rating} · ₹{guide.officialDailyRate}/day · {(guide.languages || []).join(', ')}</Text>
                <Text style={s.verified}>YATRASETU REGISTRY · {guide.availableOnDate ? 'AVAILABLE' : 'CHECK DATES'}</Text>
              </View>
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
  live: { fontSize: 10, fontWeight: '800', color: theme.ok, marginTop: 18, marginRight: 16 },
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
  empty: { textAlign: 'center', color: theme.muted, marginTop: 20 },
  panel: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 18, borderWidth: 1, borderColor: theme.line, padding: 14 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.line, marginTop: 6 },
  meter: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.paper, borderWidth: 3, borderColor: theme.teal, justifyContent: 'center', alignItems: 'center' },
  meterT: { fontSize: 12, fontWeight: '800', color: theme.tealDark },
  metricB: { fontSize: 13, fontWeight: '800', color: theme.ink },
  metricS: { fontSize: 11, color: theme.muted, marginTop: 2 },
  status: { fontSize: 10, fontWeight: '800', backgroundColor: '#e2f7ec', color: theme.ok, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  statusWarn: { backgroundColor: '#fff4d9', color: theme.warn },
  tripCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: theme.line, padding: 14, alignItems: 'center', gap: 12 },
  dayBadge: { backgroundColor: theme.teal, borderRadius: 12, width: 64, height: 64, justifyContent: 'center', alignItems: 'center' },
  dayNum: { color: '#fff', fontSize: 20, fontWeight: '800' },
  dayMon: { color: '#fff', fontSize: 10 },
  tripTitle: { fontWeight: '800', color: theme.ink, fontSize: 14 },
  tripSub: { fontSize: 11, color: theme.muted, marginTop: 3 },
  guideCard: { backgroundColor: theme.tealDark, borderRadius: 16, marginHorizontal: 16, marginTop: 10, padding: 16 },
  guideHead: { color: '#fff', fontSize: 13, fontWeight: '800' },
  guideName: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 10 },
  guideSub: { color: 'rgba(255,255,255,.75)', fontSize: 11, marginTop: 3 },
  verified: { color: '#8fe1d7', fontSize: 10, fontWeight: '800', marginTop: 6 },
});
