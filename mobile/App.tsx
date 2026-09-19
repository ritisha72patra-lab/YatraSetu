import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './src/lib/auth';
import { theme } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import DiscoverScreen from './src/screens/DiscoverScreen';
import SpotDetailScreen from './src/screens/SpotDetailScreen';
import PlannerScreen from './src/screens/PlannerScreen';
import BookingsScreen from './src/screens/BookingsScreen';
import ScanScreen from './src/screens/ScanScreen';
import FeedbackScreen from './src/screens/FeedbackScreen';
import SafetyScreen from './src/screens/SafetyScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminScreen from './src/screens/AdminScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  DiscoverTab: 'compass',
  TripsTab: 'briefcase',
  ScanTab: 'qr-code',
  SafetyTab: 'shield-checkmark',
  ProfileTab: 'person-circle',
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.teal,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { paddingBottom: 6, paddingTop: 6, height: 62 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse'} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="DiscoverTab" component={DiscoverScreen} options={{ tabBarLabel: 'Discover', title: 'Discover' }} />
      <Tabs.Screen name="TripsTab" component={BookingsScreen} options={{ tabBarLabel: 'My trips', title: 'My trips' }} />
      <Tabs.Screen name="ScanTab" component={ScanScreen} options={{ tabBarLabel: 'Scan QR', title: 'Scan QR' }} />
      <Tabs.Screen name="SafetyTab" component={SafetyScreen} options={{ tabBarLabel: 'Safety', title: 'Safety' }} />
      <Tabs.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Profile', title: 'Profile' }} />
    </Tabs.Navigator>
  );
}

function AdminTabs() {
  return <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.teal, tabBarInactiveTintColor: theme.muted }}>
    <Tabs.Screen name="ControlRoom" component={AdminScreen} options={{ tabBarLabel: 'Control room', tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" size={size} color={color} /> }} />
  </Tabs.Navigator>;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!user) return <AuthScreen />;
  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user.role === 'ADMIN' ? <Stack.Screen name="Home" component={AdminTabs} options={{ headerShown: false }} /> : <>
          <Stack.Screen name="Home" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="SpotDetail" component={SpotDetailScreen} options={({ route }: any) => ({ title: route.params?.name || 'Place' })} />
          <Stack.Screen name="Planner" component={PlannerScreen} options={{ title: 'Trip planner' }} />
          <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Feedback' }} />
        </>}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
