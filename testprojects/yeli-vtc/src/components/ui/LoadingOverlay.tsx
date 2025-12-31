import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  transparent?: boolean;
  style?: ViewStyle;
}

export function LoadingOverlay({
  visible,
  message,
  transparent = false,
  style,
}: LoadingOverlayProps) {
  const { theme } = useTheme();
  const { colors, mode } = theme;

  const overlayBackground = transparent
    ? 'rgba(0, 0, 0, 0.5)'
    : mode === 'dark'
    ? 'rgba(0, 0, 0, 0.85)'
    : 'rgba(255, 255, 255, 0.95)';

  const spinnerContainerBackground = mode === 'dark'
    ? 'rgba(30, 30, 30, 0.95)'
    : 'rgba(255, 255, 255, 0.95)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: overlayBackground }, style]}>
        <View style={[styles.spinnerContainer, { backgroundColor: spinnerContainerBackground }]}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.spinner}
          />
          {message && (
            <Text style={[styles.message, { color: colors.text }]}>
              {message}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerContainer: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 120,
  },
  spinner: {
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },
});
