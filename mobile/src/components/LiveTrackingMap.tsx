import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../theme';

export type TrackingMarker = { id: string; latitude: number; longitude: number; title: string; color?: string };

function mapHtml(markers: TrackingMarker[]) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" /><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div><script>const markers=${JSON.stringify(markers)};const map=new maplibregl.Map({container:'map',style:'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',center:[markers[0].longitude,markers[0].latitude],zoom:12});map.addControl(new maplibregl.NavigationControl(),'top-right');map.on('load',()=>{const bounds=new maplibregl.LngLatBounds();markers.forEach(m=>{bounds.extend([m.longitude,m.latitude]);const el=document.createElement('div');el.style.cssText='width:16px;height:16px;border-radius:50%;background:'+(m.color||'#1a7fe0')+';border:3px solid white;box-shadow:0 0 0 1px #345';new maplibregl.Marker({element:el}).setLngLat([m.longitude,m.latitude]).setPopup(new maplibregl.Popup().setText(m.title)).addTo(map)});if(markers.length>1)map.fitBounds(bounds,{padding:48,maxZoom:14});});</script></body></html>`;
}

export default function LiveTrackingMap({ markers, height = 220 }: { markers: TrackingMarker[]; height?: number }) {
  const valid = markers.filter((m) => Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude)));
  const html = useMemo(() => valid.length ? mapHtml(valid) : '', [JSON.stringify(valid)]);
  if (!valid.length) return <View style={[s.empty, { height }]}><Text style={s.emptyT}>No live locations are available yet.</Text></View>;
  return <View style={[s.box, { height }]}><WebView originWhitelist={['*']} source={{ html }} javaScriptEnabled domStorageEnabled startInLoadingState renderLoading={() => <ActivityIndicator style={{ marginTop: height / 2 - 12 }} />} /></View>;
}

const s = StyleSheet.create({ box: { marginTop: 10, overflow: 'hidden', borderRadius: 12, backgroundColor: '#e6efee' }, empty: { marginTop: 10, borderRadius: 12, backgroundColor: '#e6efee', alignItems: 'center', justifyContent: 'center', padding: 18 }, emptyT: { color: theme.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' } });
