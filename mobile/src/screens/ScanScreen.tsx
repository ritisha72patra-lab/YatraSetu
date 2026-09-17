import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../lib/api';
import { Screen } from '../lib/Screen';
import { theme } from '../theme';

export default function ScanScreen() {
  const [perm, requestPerm] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [qrText, setQrText] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [charged, setCharged] = useState('');
  const [result, setResult] = useState<any>(null);
  const [locked, setLocked] = useState(false);

  const verify = async (text: string) => {
    try {
      const body: any = { qrText: text };
      if (bookingId.trim()) body.bookingId = bookingId.trim();
      if (charged.trim()) body.chargedAmount = Number(charged);
      const r: any = await api('/api/verify/scan-payload', { method: 'POST', body: JSON.stringify(body) });
      setResult(r);
    } catch (e: any) {
      Alert.alert('Scan failed', e.message);
    } finally {
      setLocked(false);
    }
  };

  if (!perm?.granted) {
    return (
      <Screen>
        <Text style={s.h1}>Scan registry QR</Text>
        <Text style={s.sub}>Camera permission is needed for live scanning. Manual paste works without it.</Text>
        <Pressable style={s.primary} onPress={requestPerm}><Text style={s.primaryT}>Allow camera</Text></Pressable>
        <Manual qrText={qrText} setQrText={setQrText} bookingId={bookingId} setBookingId={setBookingId} charged={charged} setCharged={setCharged} onGo={() => verify(qrText)} />
        <Result result={result} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
    <ScrollView style={s.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.h1}>Scan registry QR</Text>
      {!scanning ? (
        <Pressable style={s.primary} onPress={() => setScanning(true)}><Text style={s.primaryT}>Open camera</Text></Pressable>
      ) : (
        <View style={s.camBox}>
          <CameraView
            style={s.cam}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(e) => {
              if (locked) return;
              setLocked(true);
              setQrText(e.data);
              setScanning(false);
              verify(e.data);
            }}
          />
          <Pressable style={s.ghost} onPress={() => setScanning(false)}><Text style={s.ghostT}>Close camera</Text></Pressable>
        </View>
      )}
      <Manual qrText={qrText} setQrText={setQrText} bookingId={bookingId} setBookingId={setBookingId} charged={charged} setCharged={setCharged} onGo={() => verify(qrText)} />
      <Result result={result} />
    </ScrollView>
    </Screen>
  );
}

function Manual({ qrText, setQrText, bookingId, setBookingId, charged, setCharged, onGo }: any) {
  return (
    <View style={s.card}>
      <Text style={s.cardH}>Manual / paste mode</Text>
      <TextInput style={s.input} placeholder='QR text {"type":"YATRASETU_VERIFICATION",…}' value={qrText} onChangeText={setQrText} multiline />
      <TextInput style={s.input} placeholder="Booking ID (optional)" value={bookingId} onChangeText={setBookingId} autoCapitalize="none" />
      <TextInput style={s.input} placeholder="Amount they quoted ₹ (for overcharge check)" value={charged} onChangeText={setCharged} keyboardType="numeric" />
      <Pressable style={s.book} onPress={onGo}><Text style={s.bookT}>Verify + scam check</Text></Pressable>
    </View>
  );
}

function Result({ result }: any) {
  if (!result) return null;
  const sev = result.scam?.severity || 'none';
  const bg = sev === 'danger' ? '#fde7e3' : sev === 'warn' ? '#fff4d9' : '#e2f7ec';
  const fg = sev === 'danger' ? theme.danger : sev === 'warn' ? theme.warn : theme.ok;
  return (
    <View style={[s.card, { backgroundColor: bg }]}>
      <Text style={[s.cardH, { color: fg }]}>
        {result.verified ? '✓ Registry approved' : '✕ NOT approved'} · {result.assignedToTrip ? 'assigned to your trip' : 'NOT your trip provider'}
      </Text>
      <Text style={s.line}>Official: ₹{result.scam?.officialPrice} {result.scam?.unit} · You were quoted: {result.scam?.chargedPrice ?? '—'}</Text>
      {(result.scam?.alerts || []).map((a: string, i: number) => <Text key={i} style={s.line}>• {a}</Text>)}
      <Text style={s.line}>{result.message}</Text>
      <Text style={s.small}>Signed QR: {String(result.signedQr ?? 'n/a')} · fixed price: {String(result.fixedPriceConfirmed)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper, padding: 16 },
  h1: { fontSize: 22, fontWeight: '800', color: theme.ink },
  sub: { color: theme.muted, fontSize: 12, marginVertical: 8 },
  primary: { backgroundColor: theme.teal, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 10 },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghost: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, backgroundColor: '#fff' },
  ghostT: { color: theme.teal, fontWeight: '700' },
  book: { backgroundColor: theme.coral, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  bookT: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: theme.line },
  cardH: { fontWeight: '800', color: theme.tealDark },
  line: { fontSize: 12, marginTop: 4, lineHeight: 17, color: theme.ink },
  small: { fontSize: 11, color: theme.muted, marginTop: 6 },
  input: { borderWidth: 1, borderColor: theme.line, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: '#fff' },
  camBox: { marginTop: 10 },
  cam: { height: 280, borderRadius: 14, overflow: 'hidden' },
});
