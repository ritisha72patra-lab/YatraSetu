import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

// App-wide screen shell: respects notch/status bar, standard paper background.
// Use `padded={false}` when the screen draws its own hero (e.g. Discover).
export function Screen({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.paper, padding: padded ? 16 : 0 }}
    >
      {children}
    </SafeAreaView>
  );
}
