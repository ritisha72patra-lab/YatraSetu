import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

export default function PlannerScreen({ route }: any) {
  const [spotId, setSpotId] = useState(route.params?.spotId || '');
  const [hotelId, setHotelId] = useState(route.params?.hotelId || '');
  const [start, setStart] = useState('2026-10-12');
  const [end, setEnd] = useState('2026-10-15');
  const [budget, setBudget] = useState(String(route.params?.budget || '20000'));
  const [prefs, setPrefs] = useState('culture, food');
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const clashMessage = 'A plan in that particular duration is already confirmed. Please choose different dates.';

  const makePlan = async (override?: { spotId: string }) => {
    try {
      setBusy(true);
      const sid = override?.spotId || spotId.trim();
      if (!sid) {
        Alert.alert('Pick a place', 'Choose a place from Discover first, or paste a Spot ID.');
        return;
      }
      // Client-side clash check against already-confirmed upcoming trips.
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
          Alert.alert('Date clash', clashMessage);
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
        Alert.alert('Date clash', clashMessage);
      } else {
        Alert.alert('Planning failed', e.message);
      }
    } finally { setBusy(false); }
  };

  // Auto-build the day-wise itinerary when opened from Discover / a spot.
  useEffect(() => {
    if (route.params?.spotId && !plan) makePlan({ spotId: route.params.spotId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.spotId]);

  const bookNow = async () => {
    try {
      setBusy(true);
      const c: any = await api('/api/payments/create', { method: 'POST', body: JSON.stringify({ bookingId: plan.booking.id }) });
      Alert.alert('Checkout', `${c.quote.guarantee}\n\nTap OK to pay ₹${c.payment.amount} (demo).`, [
        {
          text: 'Pay now', onPress: async () => {
            try {
              const done: any = await api('/api/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentId: c.payment.id }) });
              Alert.alert('Booked!', `${done.message}\nFind it under Discover → Your upcoming journeys.`);
              setPlan({ ...plan, booking: done.booking });
            } catch (e: any) {
              if (e?.status === 409 || /already.*confirmed|clash|overlap/i.test(e.message || '')) {
                Alert.alert('Date clash', clashMessage);
              } else {
                Alert.alert('Payment failed', e.message);
              }
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } catch (e: any) {
      if (e?.status === 409 || /already.*confirmed|clash|overlap/i.test(e.message || '')) {
        Alert.alert('Date clash', clashMessage);
      } else {
        Alert.alert('Payment failed', e.message);
      }
    } finally { setBusy(false); }
  };

  return (
    <Screen padded={false}>
    <ScrollView style={s.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.h1}>Trip planner{route.params?.spotName ? ` · ${route.params.spotName}` : ''}</Text>
      <TextInput style={s.input} placeholder="Spot ID (from Discover)" value={spotId} onChangeText={setSpotId} />
      <TextInput style={s.input} placeholder="Hotel ID (optional, from Spot hotels)" value={hotelId} onChangeText={setHotelId} />
      <View style={s.row}>
        <TextInput style={[s.input, s.half]} placeholder="Start YYYY-MM-DD" value={start} onChangeText={setStart} />
        <TextInput style={[s.input, s.half]} placeholder="End YYYY-MM-DD" value={end} onChangeText={setEnd} />
      </View>
      <TextInput style={s.input} placeholder="Budget ₹" keyboardType="numeric" value={budget} onChangeText={setBudget} />
      <TextInput style={s.input} placeholder="Interests: beach, heritage…" value={prefs} onChangeText={setPrefs} />
      <Pressable style={s.primary} onPress={() => makePlan()} disabled={busy}>
        <Text style={s.primaryT}>{busy ? 'Planning…' : plan ? 'Rebuild plan' : 'Build smart plan'}</Text>
      </Pressable>
      {busy && <ActivityIndicator style={{ marginTop: 12 }} />}
      {plan && (
        <View style={s.card}>
          <Text style={s.exp}>{plan.explanation}</Text>
          <Text style={s.quote}>Panthan ₹{plan.quote.total.toLocaleString('en-IN')} · rivals from ₹{plan.quote.cheapestRival.toLocaleString('en-IN')} · save ₹{plan.quote.savings.toLocaleString('en-IN')}</Text>
          {(plan.roadmap || []).map((d: any) => (
            <View key={d.day} style={s.day}>
              <View style={s.dayHead}>
                <View style={s.dayBadge}><Text style={s.dayNum}>{d.day}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dayH}>Day {d.day} · {d.date}</Text>
                  <Text style={s.dayTitle}>{d.dayTitle}</Text>
                </View>
              </View>
              {d.note ? <Text style={s.note}>{d.note}</Text> : null}
              {(d.slots || []).map((sl: any, i: number) => (
                <View key={i} style={s.slotRow}>
                  <Text style={s.slotTime}>{sl.time}</Text>
                  <View style={s.slotDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.slotAct}>{sl.activity}</Text>
                    <Text style={s.slotReason}>{sl.mode} · ~₹{sl.spend} · {sl.reason}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
          <Pressable style={s.book} onPress={bookNow}>
            <Text style={s.bookT}>Book now · ₹{plan.quote.total.toLocaleString('en-IN')}</Text>
          </Pressable>
          <Text style={s.hint}>Booking {plan.booking.id.slice(0, 8)}… · {plan.booking.status} · {plan.booking.paymentStatus}</Text>
        </View>
      )}
    </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper, padding: 16 },
  h1: { fontSize: 22, fontWeight: '800', color: theme.ink },
  input: { borderWidth: 1, borderColor: theme.line, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 10 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  primary: { backgroundColor: theme.teal, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 10 },
  primaryT: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: theme.line },
  exp: { fontSize: 12, color: theme.ink, lineHeight: 18 },
  quote: { fontWeight: '800', color: theme.ok, marginTop: 6, fontSize: 12 },
  day: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.line },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayBadge: { backgroundColor: theme.teal, borderRadius: 10, width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  dayNum: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dayH: { fontWeight: '800', color: theme.tealDark, fontSize: 13 },
  dayTitle: { fontSize: 12, color: theme.ink, fontWeight: '700' },
  note: { fontSize: 11, color: theme.muted, marginTop: 6, fontStyle: 'italic' },
  slotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 9 },
  slotTime: { fontSize: 12, fontWeight: '800', color: theme.teal, width: 52 },
  slotDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.coral, marginTop: 4 },
  slotAct: { fontSize: 13, fontWeight: '700', color: theme.ink },
  slotReason: { fontSize: 11, color: theme.muted, marginTop: 2, lineHeight: 16 },
  book: { backgroundColor: theme.coral, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  bookT: { color: '#fff', fontWeight: '800' },
  hint: { fontSize: 11, color: theme.muted, marginTop: 6, textAlign: 'center' },
});
