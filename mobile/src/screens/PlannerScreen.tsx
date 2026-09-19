import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, Alert, ActivityIndicator, Image } from 'react-native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';
import TripMap from '../components/TripMap';

const INTEREST_CHIPS = ['culture', 'beach', 'food', 'mountains', 'heritage', 'adventure'];
const BUDGET_PRESETS = [10000, 20000, 35000];

function tripDays(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

function crowdStyle(level?: string) {
  const l = String(level || '').toLowerCase();
  if (l === 'high') return { bg: '#fdecec', fg: '#c0362c', label: 'Crowd: High — we start early' };
  if (l === 'low') return { bg: '#e8f7ee', fg: '#15803d', label: 'Crowd: Low — relaxed pace' };
  return { bg: '#fdf3e0', fg: '#a37613', label: 'Crowd: Medium' };
}

export default function PlannerScreen({ route }: any) {
  const [spots, setSpots] = useState<any[]>([]);
  const [spotId, setSpotId] = useState(route.params?.spotId || '');
  const [hotels, setHotels] = useState<any[]>([]);
  const [hotelId, setHotelId] = useState(route.params?.hotelId || '');
  const [showHotelPicker, setShowHotelPicker] = useState(false);
  const [start, setStart] = useState('2026-10-12');
  const [end, setEnd] = useState('2026-10-15');
  const [budget, setBudget] = useState(String(route.params?.budget || '20000'));
  const [prefs, setPrefs] = useState('culture, food');
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);

  const clashMessage = 'Those dates overlap a confirmed trip. Please pick different dates.';
  const days = useMemo(() => tripDays(start, end), [start, end]);
  const selectedSpot = spots.find((s) => s.id === spotId) || null;
  const perDay = days > 0 && Number(budget) > 0 ? Math.round(Number(budget) / days) : 0;

  // Load place list once so users tap a name instead of pasting an ID.
  useEffect(() => {
    (async () => {
      try {
        let list: any[] = [];
        try {
          const d: any = await api('/api/spots/featured/list', {}, false);
          list = d.items || d || [];
        } catch {
          const d: any = await api('/api/spots?limit=10', {}, false);
          list = d.items || [];
        }
        setSpots(Array.isArray(list) ? list : []);
        if (!spotId && route.params?.spotId) setSpotId(route.params.spotId);
      } catch {
      } finally {
        setLoadingLists(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load hotels for the chosen place (optional picker, no pasting IDs).
  useEffect(() => {
    if (!spotId) {
      setHotels([]);
      return;
    }
    (async () => {
      try {
        const h: any = await api(`/api/hotels?spotId=${spotId}&sort=price&nights=2`, {}, false);
        setHotels(h.items || []);
      } catch {
        setHotels([]);
      }
    })();
  }, [spotId]);

  const togglePref = (chip: string) => {
    const cur = prefs.split(',').map((s) => s.trim()).filter(Boolean);
    if (cur.includes(chip)) setPrefs(cur.filter((c) => c !== chip).join(', '));
    else setPrefs([...cur, chip].join(', '));
  };

  const makePlan = async (override?: { spotId: string }) => {
    try {
      setBusy(true);
      const sid = override?.spotId || spotId.trim();
      if (!sid) {
        Alert.alert('Step 1 — pick a place', 'Tap Jaipur, Goa or Manali above to choose where you want to go.');
        return;
      }
      if (!days || days <= 0 || days > 30) {
        Alert.alert('Step 2 — check dates', 'Use format YYYY-MM-DD, e.g. start 2026-10-12 and end 2026-10-15. End must be after start.');
        return;
      }
      if (!Number(budget) || Number(budget) < 1000) {
        Alert.alert('Step 2 — check budget', 'Enter a total trip budget of at least ₹1,000.');
        return;
      }
      // Friendly clash check before calling the server.
      try {
        const mine: any = await api('/api/trips/mine');
        const ns = new Date(start).getTime();
        const ne = new Date(end).getTime();
        const clash = (Array.isArray(mine) ? mine : []).find((t: any) => {
          if (t.status !== 'CONFIRMED') return false;
          const s = new Date(t.startDate).getTime();
          const e = new Date(t.endDate).getTime();
          return ns <= e && s <= ne;
        });
        if (clash) {
          Alert.alert('Dates overlap', clashMessage);
          return;
        }
      } catch {}
      const body: any = {
        spotId: sid, startDate: start, endDate: end,
        budget: Number(budget), preferences: prefs.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (hotelId.trim()) body.hotelId = hotelId.trim();
      const p: any = await api('/api/trips/plan', { method: 'POST', body: JSON.stringify(body) });
      setPlan(p);
    } catch (e: any) {
      if (e?.status === 409 || /already.*confirmed|clash|overlap/i.test(e.message || '')) {
        Alert.alert('Dates overlap', clashMessage);
      } else {
        Alert.alert('Could not build plan', e.message);
      }
    } finally { setBusy(false); }
  };

  // Auto-build when opened from Discover / a place page.
  useEffect(() => {
    if (route.params?.spotId && !plan) makePlan({ spotId: route.params.spotId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.spotId]);

  const bookNow = async () => {
    try {
      setBusy(true);
      const c: any = await api('/api/payments/create', { method: 'POST', body: JSON.stringify({ bookingId: plan.booking.id }) });
      Alert.alert('Almost done', `Total ₹${c.payment.amount.toLocaleString('en-IN')} (demo payment).\n${c.quote.guarantee}\n\nTap Pay to confirm your trip.`, [
        {
          text: 'Pay now', onPress: async () => {
            try {
              const done: any = await api('/api/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentId: c.payment.id }) });
              Alert.alert('Trip booked!', 'Find it under Discover → Your upcoming journeys.');
              setPlan({ ...plan, booking: done.booking });
            } catch (e: any) {
              Alert.alert('Payment failed', /already.*confirmed|clash|overlap/i.test(e.message || '') ? clashMessage : e.message);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } catch (e: any) {
      Alert.alert('Payment failed', /already.*confirmed|clash|overlap/i.test(e.message || '') ? clashMessage : e.message);
    } finally { setBusy(false); }
  };

  const destLat = plan?.booking?.spot?.latitude ?? selectedSpot?.latitude ?? null;
  const destLon = plan?.booking?.spot?.longitude ?? selectedSpot?.longitude ?? null;
  const destName = plan?.booking?.spot?.name || selectedSpot?.name || route.params?.spotName || 'Destination';
  const bb = plan?.budgetBreakdown;

  return (
    <Screen padded={false}>
    <ScrollView style={s.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <Image source={require('../../assets/panthan-logo.jpeg')} style={s.logo} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>Plan your trip{route.params?.spotName ? ` · ${route.params.spotName}` : ''}</Text>
          <Text style={s.sub}>3 quick steps — we handle crowds, weather and budget.</Text>
        </View>
      </View>
      <View style={s.steps}>
        <Text style={[s.step, spotId ? s.stepDone : s.stepNow]}>1 · Where{selectedSpot ? ` ✓ ${selectedSpot.name}` : ''}</Text>
        <Text style={[s.step, days > 0 && Number(budget) >= 1000 ? s.stepDone : s.stepNow]}>2 · When & budget{days > 0 ? ` · ${days}d` : ''}</Text>
        <Text style={[s.step, plan ? s.stepDone : null]}>3 · Your plan</Text>
      </View>

      {/* STEP 1 — Where */}
      <View style={s.card}>
        <Text style={s.cardH}>Step 1 — Where do you want to go?</Text>
        <Text style={s.help}>Tap a place. No need to copy any ID.</Text>
        {loadingLists ? <ActivityIndicator style={{ marginTop: 8 }} /> : (
          <View style={s.chipRow}>
            {spots.map((sp) => (
              <Pressable key={sp.id} onPress={() => setSpotId(sp.id)} style={[s.placeChip, spotId === sp.id && s.placeChipOn]}>
                <Text style={[s.placeChipT, spotId === sp.id && s.placeChipTOn]}>{sp.name}</Text>
                <Text style={[s.placeSub, spotId === sp.id && s.placeSubOn]}>{sp.placeType} · ₹{Number(sp.averageCost).toLocaleString('en-IN')}/day</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable onPress={() => setShowHotelPicker((v) => !v)} style={s.linkBtn}>
          <Text style={s.linkT}>{showHotelPicker ? 'Hide hotel choice ▲' : 'Choose a hotel (optional) ▼'}</Text>
        </Pressable>
        {showHotelPicker ? (
          hotels.length === 0 ? <Text style={s.help}>No hotels loaded yet — you can still build the plan.</Text> :
          <>
            <Pressable onPress={() => setHotelId('')} style={[s.hotelChip, !hotelId && s.hotelChipOn]}>
              <Text style={[s.hotelT, !hotelId && s.hotelTOn]}>No specific hotel — just plan</Text>
            </Pressable>
            {hotels.map((h) => (
              <Pressable key={h.id} onPress={() => setHotelId(h.id)} style={[s.hotelChip, hotelId === h.id && s.hotelChipOn]}>
                <Text style={[s.hotelT, hotelId === h.id && s.hotelTOn]}>{h.name} · ₹{Number(h.pricePerNight).toLocaleString('en-IN')}/night</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </View>

      {/* STEP 2 — When & budget */}
      <View style={s.card}>
        <Text style={s.cardH}>Step 2 — When and how much?</Text>
        <Text style={s.help}>Dates as YYYY-MM-DD · e.g. 2026-10-12 to 2026-10-15</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Start date</Text>
            <TextInput style={s.input} placeholder="2026-10-12" value={start} onChangeText={setStart} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>End date</Text>
            <TextInput style={s.input} placeholder="2026-10-15" value={end} onChangeText={setEnd} />
          </View>
        </View>
        <Text style={s.daysLine}>{days > 0 ? `📅 ${days} day${days > 1 ? 's' : ''}${perDay ? ` · about ₹${perDay.toLocaleString('en-IN')} per day` : ''}` : 'Enter an end date after the start date.'}</Text>
        <Text style={s.label}>Total budget (₹)</Text>
        <View style={s.chipRow}>
          {BUDGET_PRESETS.map((b) => (
            <Pressable key={b} onPress={() => setBudget(String(b))} style={[s.miniChip, Number(budget) === b && s.miniChipOn]}>
              <Text style={[s.miniT, Number(budget) === b && s.miniTOn]}>₹{b.toLocaleString('en-IN')}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.input} placeholder="e.g. 20000" keyboardType="numeric" value={budget} onChangeText={setBudget} />
        <Text style={s.label}>What do you enjoy? (tap to add)</Text>
        <View style={s.chipRow}>
          {INTEREST_CHIPS.map((c) => {
            const on = prefs.split(',').map((x) => x.trim()).includes(c);
            return (
              <Pressable key={c} onPress={() => togglePref(c)} style={[s.miniChip, on && s.miniChipOn]}>
                <Text style={[s.miniT, on && s.miniTOn]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput style={s.input} placeholder="Interests: beach, heritage…" value={prefs} onChangeText={setPrefs} />
        <Pressable style={s.primary} onPress={() => makePlan()} disabled={busy}>
          <Text style={s.primaryT}>{busy ? 'Building your plan…' : plan ? 'Rebuild my plan' : 'See my day-wise plan →'}</Text>
        </Pressable>
        {busy && <ActivityIndicator style={{ marginTop: 12 }} />}
      </View>

      {/* STEP 3 — Result */}
      {plan && (
        <View style={s.card}>
          <Text style={s.cardH}>Step 3 — Your day-wise plan</Text>
          <Text style={s.summary}>
            Your {plan.roadmap?.length || days}-day {destName} trip · ₹{Number(plan.quote.total).toLocaleString('en-IN')} total
            {perDay ? ` (about ₹${perDay.toLocaleString('en-IN')}/day)` : ''}.
          </Text>
          <Text style={s.quote}>Panthan ₹{plan.quote.total.toLocaleString('en-IN')} · elsewhere from ₹{plan.quote.cheapestRival.toLocaleString('en-IN')} · you save ₹{plan.quote.savings.toLocaleString('en-IN')}</Text>

          {/* Live map (MapLibre) — destination + your real-time location */}
          <Text style={s.mapH}>Live map — destination + where you are now</Text>
          <TripMap destLat={destLat} destLon={destLon} destName={destName} />

          {bb ? (
            <View style={s.budgetBox}>
              <Text style={s.budgetH}>Where your ₹{Number(budget).toLocaleString('en-IN')} goes</Text>
              <BudgetBar accommodation={bb.accommodation} food={bb.food} transit={bb.transit} activities={bb.activities} />
              <Text style={s.budgetT}>Stay ₹{bb.accommodation.toLocaleString('en-IN')} · Food ₹{bb.food.toLocaleString('en-IN')} · Travel ₹{bb.transit.toLocaleString('en-IN')} · Fun ₹{bb.activities.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}

          {plan.suggestedGuide ? (
            <Text style={s.guide}>👋 Your guide: {plan.suggestedGuide.name} · ₹{plan.suggestedGuide.officialDailyRate}/day · ★{plan.suggestedGuide.rating}</Text>
          ) : null}

          {(plan.roadmap || []).map((d: any) => {
            const cs = crowdStyle(d.signals?.crowdLevel || d.crowdLevel);
            return (
              <View key={d.day} style={s.day}>
                <View style={s.dayHead}>
                  <View style={s.dayBadge}><Text style={s.dayNum}>{d.day}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.dayH}>Day {d.day} · {d.date}</Text>
                    <Text style={s.dayTitle}>{d.dayTitle}</Text>
                  </View>
                </View>
                <View style={s.badgeRow}>
                  <Text style={[s.badge, { backgroundColor: cs.bg, color: cs.fg }]}>{cs.label}{d.signals?.crowdScore ? ` (${d.signals.crowdScore})` : ''}</Text>
                  {d.signals ? (
                    <Text style={s.badge2}>🌤 {d.signals.weather} · {d.signals.temperature}°C · AQI {d.signals.aqi}</Text>
                  ) : null}
                </View>
                {d.note ? <Text style={s.note}>💡 {d.note}</Text> : null}
                {(d.slots || []).map((sl: any, i: number) => (
                  <View key={i} style={s.slotRow}>
                    <Text style={s.slotTime}>{sl.time}</Text>
                    <View style={s.slotDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.slotAct}>{sl.activity}</Text>
                      <Text style={s.slotReason}>{sl.mode} · about ₹{sl.spend}</Text>
                      <Text style={s.why}>Why this time? {sl.reason}</Text>
                    </View>
                  </View>
                ))}
                <Text style={s.spend}>Day total ≈ ₹{Number(d.estimatedSpend).toLocaleString('en-IN')}</Text>
              </View>
            );
          })}
          <Pressable style={s.book} onPress={bookNow}>
            <Text style={s.bookT}>Book this trip · ₹{plan.quote.total.toLocaleString('en-IN')}</Text>
          </Pressable>
          <Text style={s.hint}>Status: {plan.booking.status} · Payment: {plan.booking.paymentStatus} · Booking {String(plan.booking.id).slice(0, 8)}…</Text>
        </View>
      )}
    </ScrollView>
    </Screen>
  );
}

function BudgetBar({ accommodation, food, transit, activities }: any) {
  const total = (accommodation + food + transit + activities) || 1;
  const segs = [
    { v: accommodation / total, c: theme.teal },
    { v: food / total, c: theme.coral },
    { v: transit / total, c: '#0284c7' },
    { v: activities / total, c: '#e6a23d' },
  ];
  return (
    <View style={s.bar}>
      {segs.map((g, i) => (
        <View key={i} style={{ flex: g.v, backgroundColor: g.c }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 72, height: 46, borderRadius: 8 },
  h1: { fontSize: 20, fontWeight: '800', color: theme.ink },
  sub: { fontSize: 12, color: theme.muted, marginTop: 2 },
  steps: { flexDirection: 'row', gap: 6, marginTop: 10 },
  step: { flex: 1, fontSize: 11, fontWeight: '800', backgroundColor: '#fff', borderWidth: 1, borderColor: theme.line, borderRadius: 9, padding: 8, textAlign: 'center', color: theme.muted },
  stepNow: { borderColor: theme.teal, color: theme.tealDark },
  stepDone: { backgroundColor: '#e8f7ee', borderColor: '#bfe6cd', color: theme.ok },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: theme.line },
  cardH: { fontSize: 15, fontWeight: '800', color: theme.ink },
  help: { fontSize: 12, color: theme.muted, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '800', color: theme.tealDark, marginTop: 10 },
  input: { borderWidth: 1, borderColor: theme.line, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 6 },
  row: { flexDirection: 'row', gap: 8 },
  daysLine: { fontSize: 12, color: theme.tealDark, fontWeight: '700', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  placeChip: { borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 10, minWidth: 100, alignItems: 'center', backgroundColor: theme.paper },
  placeChipOn: { backgroundColor: theme.tealDark, borderColor: theme.tealDark },
  placeChipT: { fontWeight: '800', color: theme.ink, fontSize: 14 },
  placeChipTOn: { color: '#fff' },
  placeSub: { fontSize: 10, color: theme.muted, marginTop: 2 },
  placeSubOn: { color: 'rgba(255,255,255,.8)' },
  miniChip: { borderWidth: 1, borderColor: theme.line, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: '#fff' },
  miniChipOn: { backgroundColor: theme.teal, borderColor: theme.teal },
  miniT: { fontSize: 12, fontWeight: '700', color: theme.ink },
  miniTOn: { color: '#fff' },
  linkBtn: { marginTop: 10, padding: 6 },
  linkT: { color: theme.teal, fontWeight: '800', fontSize: 12 },
  hotelChip: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, marginTop: 6, backgroundColor: '#fff' },
  hotelChipOn: { borderColor: theme.teal, backgroundColor: '#eefaf9' },
  hotelT: { fontSize: 12, color: theme.ink },
  hotelTOn: { fontWeight: '800', color: theme.tealDark },
  primary: { backgroundColor: theme.teal, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  primaryT: { color: '#fff', fontWeight: '800' },
  summary: { fontSize: 13, color: theme.ink, marginTop: 6, lineHeight: 19, fontWeight: '700' },
  quote: { fontWeight: '800', color: theme.ok, marginTop: 4, fontSize: 12 },
  mapH: { fontWeight: '800', color: theme.tealDark, marginTop: 12, fontSize: 13 },
  budgetBox: { backgroundColor: theme.paper, borderRadius: 10, padding: 10, marginTop: 10 },
  budgetH: { fontWeight: '800', color: theme.tealDark, fontSize: 12 },
  budgetT: { fontSize: 11, color: theme.muted, marginTop: 6, lineHeight: 16 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 8, backgroundColor: theme.line },
  guide: { fontSize: 12, color: theme.tealDark, fontWeight: '700', marginTop: 8 },
  day: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.line },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayBadge: { backgroundColor: theme.teal, borderRadius: 10, width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  dayNum: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dayH: { fontWeight: '800', color: theme.tealDark, fontSize: 13 },
  dayTitle: { fontSize: 12, color: theme.ink, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { fontSize: 11, fontWeight: '800', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, overflow: 'hidden' },
  badge2: { fontSize: 11, color: theme.muted, backgroundColor: theme.paper, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  note: { fontSize: 11, color: theme.muted, marginTop: 6, fontStyle: 'italic', lineHeight: 16 },
  slotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 9 },
  slotTime: { fontSize: 12, fontWeight: '800', color: theme.teal, width: 52 },
  slotDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.coral, marginTop: 4 },
  slotAct: { fontSize: 13, fontWeight: '700', color: theme.ink },
  slotReason: { fontSize: 11, color: theme.muted, marginTop: 2 },
  why: { fontSize: 11, color: theme.tealDark, marginTop: 2, lineHeight: 15 },
  spend: { fontSize: 11, color: theme.muted, marginTop: 6, textAlign: 'right' },
  book: { backgroundColor: theme.coral, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  bookT: { color: '#fff', fontWeight: '800' },
  hint: { fontSize: 11, color: theme.muted, marginTop: 6, textAlign: 'center' },
});
