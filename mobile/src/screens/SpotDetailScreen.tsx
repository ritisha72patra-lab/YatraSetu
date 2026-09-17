import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, TextInput, Alert, Image } from 'react-native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

export default function SpotDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [spot, setSpot] = useState<any>(null);
  const [crowd, setCrowd] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [hotels, setHotels] = useState<any[]>([]);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [busyHotel, setBusyHotel] = useState<string | null>(null);

  const load = async () => {
    const s: any = await api(`/api/spots/${id}`, {}, false);
    setSpot(s);
    setHotels(s.hotels || []);
    try { setCrowd(await api(`/api/spots/${id}/crowd-prediction?date=${new Date().toISOString().slice(0, 10)}`, {}, false)); } catch {}
    try { setPrice(await api(`/api/spots/${id}/price-compare?days=3`, {}, false)); } catch {}
    try { setReviews(await api(`/api/feedback?spotId=${id}`, {}, false)); } catch {}
    try { setSummary(await api(`/api/feedback/summary?spotId=${id}`, {}, false)); } catch {}
    // Fresh hotel prices (cheapest first, 2-night stay math)
    try {
      const h: any = await api(`/api/hotels?spotId=${id}&sort=price&nights=2`, {}, false);
      if (h.items?.length) setHotels(h.items);
    } catch {}
  };

  useEffect(() => { load().catch((e) => Alert.alert('Failed', e.message)); }, [id]);

  const submitReview = async () => {
    try {
      await api('/api/feedback', { method: 'POST', body: JSON.stringify({ spotId: id, rating: Number(rating) || 5, comment }) });
      setComment('');
      load();
      Alert.alert('Thanks!', 'Your review helps fellow travellers.');
    } catch (e: any) { Alert.alert('Review failed', e.message); }
  };

  const bookHotel = async (hotel: any) => {
    try {
      setBusyHotel(hotel.id);
      // 1) Hold the hotel stay (creates a DRAFT booking with hotelId)
      const held: any = await api('/api/hotels/book', {
        method: 'POST',
        body: JSON.stringify({ hotelId: hotel.id, startDate: '2026-10-12', endDate: '2026-10-15', budget: 20000 }),
      });
      // 2) Book Now: create checkout (mock or Razorpay) then confirm payment
      const c: any = await api('/api/payments/create', { method: 'POST', body: JSON.stringify({ bookingId: held.booking.id }) });
      Alert.alert(
        'Book now',
        `${hotel.name}\n${held.hotel?.nights || 3} night(s) · Total ₹${c.payment.amount.toLocaleString('en-IN')}\n${c.quote.guarantee}\n\nTap Pay to confirm.`,
        [
          {
            text: 'Pay now',
            onPress: async () => {
              try {
                const done: any = await api('/api/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentId: c.payment.id }) });
                Alert.alert('Booked!', done.message);
              } catch (e: any) { Alert.alert('Payment failed', e.message); }
            },
          },
          { text: 'Later', style: 'cancel' },
        ]
      );
    } catch (e: any) { Alert.alert('Booking failed', e.message); } finally { setBusyHotel(null); }
  };

  if (!spot) return <ActivityIndicator style={{ marginTop: 60 }} />;
  return (
    <Screen padded={false}>
    <ScrollView style={s.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
      {spot.imageUrl ? <Image source={{ uri: spot.imageUrl }} style={s.hero} /> : null}
      <View style={s.body}>
      <Text style={s.h1}>{spot.name}</Text>
      <Text style={s.type}>{spot.placeType || 'Place'} · {spot.city}, {spot.state} · Safety {spot.safetyScore}/100</Text>
      <Text style={s.desc}>{spot.description}</Text>
      {crowd && (
        <View style={s.card}>
          <Text style={s.cardH}>Crowd forecast · {crowd.level} ({crowd.crowdScore})</Text>
          {(crowd.explanation || []).map((e: string, i: number) => <Text key={i} style={s.line}>• {e}</Text>)}
          <Text style={s.model}>Model: {crowd.model}</Text>
        </View>
      )}
      {price && (
        <View style={s.card}>
          <Text style={s.cardH}>Lowest-price promise · ₹{price.total?.toLocaleString('en-IN')} / {price.days}d</Text>
          {(price.competitors || []).map((c: any) => <Text key={c.name} style={s.line}>{c.name}: ₹{c.total.toLocaleString('en-IN')}</Text>)}
          <Text style={s.save}>You save ₹{(price.savings || 0).toLocaleString('en-IN')} vs cheapest rival</Text>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardH}>Popular hotels · best prices ({hotels.length})</Text>
        {hotels.length === 0 && <Text style={s.line}>No hotels yet — run the seed (npm run prisma:seed).</Text>}
        {hotels.map((h: any) => (
          <View key={h.id} style={s.hotel}>
            {h.imageUrl ? <Image source={{ uri: h.imageUrl }} style={s.hotelImg} /> : null}
            <View style={s.hotelRow}>
              <Text style={s.hotelName}>{'★'.repeat(Math.min(5, h.stars))} {h.name}</Text>
              <Text style={s.hotelRating}>★{h.rating} ({h.reviewsCount})</Text>
            </View>
            <Text style={s.line}>{(h.amenities || []).join(' · ')}</Text>
            <View style={s.hotelRow}>
              <View>
                <Text style={s.price}>₹{Number(h.pricePerNight).toLocaleString('en-IN')}<Text style={s.perNight}>/night</Text></Text>
                {h.mrpPerNight > h.pricePerNight && (
                  <Text style={s.mrp}>MRP ₹{Number(h.mrpPerNight).toLocaleString('en-IN')} · save ₹{(Number(h.mrpPerNight) - Number(h.pricePerNight)).toLocaleString('en-IN')}</Text>
                )}
                {h.totalForStay && <Text style={s.stayTotal}>2n stay ≈ ₹{Number(h.totalForStay).toLocaleString('en-IN')}</Text>}
              </View>
              <Pressable style={s.book} onPress={() => bookHotel(h)} disabled={busyHotel === h.id}>
                <Text style={s.bookT}>{busyHotel === h.id ? '…' : 'Book now'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardH}>Reviews {summary?.count ? `· ${summary.avgRating}★ (${summary.count})` : ''}</Text>
        {reviews.slice(0, 5).map((r) => (
          <Text key={r.id} style={s.line}>★{r.rating} {r.user?.name || 'Traveller'} — {r.comment || ''}</Text>
        ))}
        <TextInput style={s.input} placeholder="Rating 1-5" keyboardType="numeric" value={rating} onChangeText={setRating} />
        <TextInput style={s.input} placeholder="Share your experience…" value={comment} onChangeText={setComment} multiline />
        <Pressable style={s.primary} onPress={submitReview}><Text style={s.primaryT}>Submit review</Text></Pressable>
      </View>
      <Pressable style={s.plan} onPress={() => navigation.navigate('Planner', { spotId: id, spotName: spot.name })}>
        <Text style={s.planT}>Plan full trip →</Text>
      </Pressable>
      </View>
    </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper },
  body: { padding: 16 },
  hero: { height: 220, width: '100%' },
  h1: { fontSize: 26, fontWeight: '800', color: theme.ink },
  type: { color: theme.tealDark, fontWeight: '700', marginTop: 2, fontSize: 13 },
  desc: { color: theme.ink, marginTop: 8, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: theme.line },
  cardH: { fontWeight: '800', color: theme.tealDark, marginBottom: 6 },
  line: { fontSize: 12, color: theme.ink, marginTop: 3, lineHeight: 17 },
  model: { fontSize: 11, color: theme.muted, marginTop: 6 },
  save: { fontWeight: '800', color: theme.ok, marginTop: 6 },
  hotel: { borderTopWidth: 1, borderTopColor: theme.line, marginTop: 10, paddingTop: 10 },
  hotelImg: { height: 120, width: '100%', borderRadius: 10, marginBottom: 8 },
  hotelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  hotelName: { fontWeight: '800', color: theme.ink, fontSize: 13, flex: 1 },
  hotelRating: { fontSize: 11, fontWeight: '700', color: theme.tealDark },
  price: { fontWeight: '800', color: theme.ink, fontSize: 15, marginTop: 4 },
  perNight: { fontWeight: '400', fontSize: 11, color: theme.muted },
  mrp: { fontSize: 11, color: theme.ok, fontWeight: '700' },
  stayTotal: { fontSize: 11, color: theme.muted },
  book: { backgroundColor: theme.coral, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  bookT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  input: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: '#fff' },
  primary: { backgroundColor: theme.teal, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  primaryT: { color: '#fff', fontWeight: '800' },
  plan: { backgroundColor: theme.tealDark, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 14 },
  planT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
