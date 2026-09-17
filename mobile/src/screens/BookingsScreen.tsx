import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

export default function BookingsScreen() {
  const [trips, setTrips] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openPlan, setOpenPlan] = useState<string | null>(null);

  const load = async () => {
    try {
      setRefreshing(true);
      setTrips(await api('/api/trips/mine'));
    } catch (e: any) { Alert.alert('Failed', e.message); } finally { setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const pay = async (id: string) => {
    try {
      const c: any = await api('/api/payments/create', { method: 'POST', body: JSON.stringify({ bookingId: id }) });
      const done: any = await api('/api/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentId: c.payment.id }) });
      Alert.alert('Booked!', done.message);
      load();
    } catch (e: any) { Alert.alert('Payment failed', e.message); }
  };

  return (
    <Screen>
      <Text style={s.h1}>My trips</Text>
      <FlatList
        data={trips}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.name}>{item.spot?.name}{item.spot?.placeType ? ` · ${item.spot.placeType}` : ''} · {item.status} · {item.paymentStatus}</Text>
            <Text style={s.meta}>{String(item.startDate).slice(0, 10)} → {String(item.endDate).slice(0, 10)} · budget ₹{item.budget}{item.totalAmount ? ` · total ₹${item.totalAmount}` : ''}</Text>
            {item.hotel && <Text style={s.meta}>Hotel: {item.hotel.name} (₹{item.hotel.pricePerNight}/night)</Text>}
            {item.guide && <Text style={s.meta}>Guide: {item.guide.user?.name} (₹{item.agreedRate}/day)</Text>}
            {item.itinerary?.roadmap?.length ? (
              <>
                <Pressable style={s.planBtn} onPress={() => setOpenPlan(openPlan === item.id ? null : item.id)}>
                  <Text style={s.planBtnT}>{openPlan === item.id ? 'Hide day-wise plan ▲' : 'View day-wise plan ▼'}</Text>
                </Pressable>
                {openPlan === item.id && (
                  <View style={s.planBox}>
                    {item.itinerary.roadmap.map((d: any) => (
                      <View key={d.day} style={s.planDay}>
                        <Text style={s.planDayH}>Day {d.day} · {d.date || ''} — {d.dayTitle || ''}</Text>
                        {(d.slots || []).map((sl: any, i: number) => (
                          <View key={i} style={s.slotRow}>
                            <Text style={s.slotTime}>{sl.time}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={s.slotAct}>{sl.activity}</Text>
                              <Text style={s.slotReason}>{sl.mode} · ~₹{sl.spend}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}
            {item.paymentStatus !== 'PAID' && (
              <Pressable style={s.book} onPress={() => pay(item.id)}><Text style={s.bookT}>Book now / Pay</Text></Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No trips yet — plan one from Discover.</Text>}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper, padding: 16 },
  h1: { fontSize: 22, fontWeight: '800', color: theme.ink },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: theme.line },
  name: { fontWeight: '800', color: theme.ink },
  meta: { fontSize: 12, color: theme.muted, marginTop: 3 },
  book: { backgroundColor: theme.coral, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  bookT: { color: '#fff', fontWeight: '800' },
  planBtn: { marginTop: 8, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: theme.teal, borderRadius: 10 },
  planBtnT: { color: theme.teal, fontWeight: '800', fontSize: 12 },
  planBox: { marginTop: 8, backgroundColor: theme.paper, borderRadius: 10, padding: 10 },
  planDay: { marginTop: 8 },
  planDayH: { fontWeight: '800', color: theme.tealDark, fontSize: 12 },
  slotRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  slotTime: { fontSize: 11, fontWeight: '800', color: theme.teal, width: 52 },
  slotAct: { fontSize: 12, fontWeight: '700', color: theme.ink },
  slotReason: { fontSize: 11, color: theme.muted },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 30 },
});
