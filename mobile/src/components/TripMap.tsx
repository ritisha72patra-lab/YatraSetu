import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { theme } from '../theme';

type Props = {
  destLat?: number | null;
  destLon?: number | null;
  destName?: string;
  height?: number;
};

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const a = s1 * s1 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildHtml(destLat: number, destLon: number, destName: string) {
  // MapLibre GL JS (free, no API key) + CARTO Voyager basemap (free, OSM data).
  // Destination + live user dot are updated from React Native via window.postMessage / injected JS.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%} .lbl{background:#0b3f43;color:#fff;font:700 11px system-ui;padding:4px 8px;border-radius:8px;white-space:nowrap}</style>
</head><body><div id="map"></div>
<script>
(function(){
  var dest = { lat: ${JSON.stringify(destLat)}, lon: ${JSON.stringify(destLon)}, name: ${JSON.stringify(destName)} };
  var map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    center: [dest.lon, dest.lat],
    zoom: 11,
    attributionControl: true
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({}), 'bottom-left');
  var destMarker = null, userMarker = null, userLoc = null;
  function fit() {
    if (destMarker && userLoc) {
      var b = new maplibregl.LngLatBounds();
      b.extend([dest.lon, dest.lat]); b.extend([userLoc.lon, userLoc.lat]);
      map.fitBounds(b, { padding: 60, maxZoom: 12, duration: 600 });
    } else {
      map.flyTo({ center: [dest.lon, dest.lat], zoom: 11 });
    }
  }
  map.on('load', function(){
    var el = document.createElement('div');
    el.className = 'lbl'; el.textContent = dest.name || 'Destination';
    destMarker = new maplibregl.Marker({ color: '#ed745b' }).setLngLat([dest.lon, dest.lat]).setPopup(new maplibregl.Popup().setText(dest.name || 'Destination')).addTo(map);
    fit();
  });
  window.setDestination = function(lat, lon, name){
    dest = { lat: lat, lon: lon, name: name };
    if (destMarker) destMarker.setLngLat([lon, lat]);
    else destMarker = new maplibregl.Marker({ color: '#ed745b' }).setLngLat([lon, lat]).addTo(map);
    fit();
  };
  window.setUserLoc = function(lat, lon){
    userLoc = { lat: lat, lon: lon };
    if (userMarker) userMarker.setLngLat([lon, lat]);
    else {
      var dot = document.createElement('div');
      dot.style.cssText = 'width:16px;height:16px;border-radius:8px;background:#0284c7;border:3px solid #fff;box-shadow:0 0 0 2px #0284c7';
      userMarker = new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(map);
    }
    fit();
  };
  document.addEventListener('message', function(e){ onMsg(e.data); });
  window.addEventListener('message', function(e){ onMsg(e.data); });
  function onMsg(raw){
    try {
      var m = JSON.parse(raw);
      if (m.type === 'user' && isFinite(m.lat) && isFinite(m.lon)) window.setUserLoc(m.lat, m.lon);
      if (m.type === 'dest' && isFinite(m.lat) && isFinite(m.lon)) window.setDestination(m.lat, m.lon, m.name || 'Destination');
    } catch(_){}
  }
})();
</script></body></html>`;
}

export default function TripMap({ destLat, destLon, destName = 'Destination', height = 230 }: Props) {
  const webRef = useRef<WebView>(null);
  const [user, setUser] = useState<{ lat: number; lon: number } | null>(null);
  const [status, setStatus] = useState('Finding your live location…');
  const [mapReady, setMapReady] = useState(false);

  const hasDest = typeof destLat === 'number' && typeof destLon === 'number';
  // Default to India view until destination loads.
  const html = useMemo(
    () => buildHtml(hasDest ? destLat! : 22.9734, hasDest ? destLon! : 78.6569, hasDest ? destName : 'India'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasDest ? `${destLat},${destLon}` : 'india']
  );

  // Push destination updates into the live map.
  useEffect(() => {
    if (mapReady && hasDest && webRef.current) {
      webRef.current.postMessage(JSON.stringify({ type: 'dest', lat: destLat, lon: destLon, name: destName }));
    }
  }, [mapReady, hasDest, destLat, destLon, destName]);

  // Live user location (real-time).
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted') {
          setStatus('Location permission denied — destination still shown.');
          return;
        }
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const u = { lat: cur.coords.latitude, lon: cur.coords.longitude };
        setUser(u);
        webRef.current?.postMessage(JSON.stringify({ type: 'user', ...u }));
        setStatus('Live location on');
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          (loc) => {
            const nu = { lat: loc.coords.latitude, lon: loc.coords.longitude };
            setUser(nu);
            webRef.current?.postMessage(JSON.stringify({ type: 'user', ...nu }));
          }
        );
      } catch {
        setStatus('Could not read GPS — destination still shown.');
      }
    })();
    return () => {
      sub?.remove();
    };
  }, []);

  const dist =
    user && hasDest ? haversineKm(user.lat, user.lon, destLat!, destLon!) : null;

  return (
    <View style={[s.box, { height: height + 34 }]}>
      <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e6efee' }}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          javaScriptEnabled
          domStorageEnabled
          onLoadEnd={() => {
            setMapReady(true);
            if (user) webRef.current?.postMessage(JSON.stringify({ type: 'user', ...user }));
          }}
          renderLoading={() => <ActivityIndicator style={{ marginTop: 80 }} />}
          startInLoadingState
        />
        {!mapReady ? (
          <View style={s.loading}>
            <ActivityIndicator />
            <Text style={s.loadingT}>Loading live map (MapLibre)…</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.status}>
        {dist != null
          ? `📍 You are ${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`} from ${destName} · ${status}`
          : `📍 ${hasDest ? destName : 'Pick a place to see it here'} · ${status}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { marginTop: 10 },
  status: { fontSize: 11, color: theme.muted, marginTop: 6, lineHeight: 16 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 70 },
  loadingT: { fontSize: 11, color: theme.muted, marginTop: 6 },
});
