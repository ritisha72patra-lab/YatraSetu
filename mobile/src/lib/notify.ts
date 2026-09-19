import { Alert, Platform } from 'react-native';

/**
 * React Native's Alert.alert() is a silent no-op on web (react-native-web
 * does not implement a native dialog). Without this, errors on the web
 * target vanish with no visible feedback — the UI just resets as if
 * nothing happened, which looks like the app is "stuck" when it actually
 * failed and reset correctly, just invisibly.
 *
 * Use this instead of Alert.alert anywhere the message must be seen by
 * the person testing on Expo web, not just native.
 */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
