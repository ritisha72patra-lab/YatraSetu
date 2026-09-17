import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

export default function FeedbackScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    try {
      setRefreshing(true);
      setItems(await api('/api/feedback/mine'));
    } catch (e: any) { Alert.alert('Failed', e.message); } finally { setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));
  return (
    <Screen>
      <Text style={s.h1}>My feedback</Text>
      <Text style={s.sub}>Submit reviews from a spot page — they appear here and improve crowd forecasts.</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.t}>★{item.rating} · {item.spot?.name || item.guide?.user?.name || 'Trip'}</Text>
            {item.comment ? <Text style={s.c}>{item.comment}</Text> : null}
            <Text style={s.d}>{String(item.createdAt).slice(0, 10)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No reviews yet.</Text>}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper, padding: 16 },
  h1: { fontSize: 22, fontWeight: '800', color: theme.ink },
  sub: { color: theme.muted, fontSize: 12, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: theme.line },
  t: { fontWeight: '800', color: theme.ink },
  c: { color: theme.ink, marginTop: 4, fontSize: 13 },
  d: { color: theme.muted, fontSize: 11, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 30 },
});
