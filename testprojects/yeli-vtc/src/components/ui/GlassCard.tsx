import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  blur?: 'light' | 'medium' | 'heavy';
  padding?: number;
  borderRadius?: number;
}

export function GlassCard({
  children,
  style,
  blur = 'medium',
  padding = 16,
  borderRadius = 16,
}: GlassCardProps) {
  const { theme } = useTheme();
  const { colors, mode } = theme;

  const getGlassBackground = (): string => {
    const baseOpacity = mode === 'dark' ? 0.2 : 0.7;
    const opacityMultiplier = {
      light: 0.6,
      medium: 1,
      heavy: 1.4,
    };
    const opacity = Math.min(baseOpacity * opacityMultiplier[blur], 0.95);

    if (mode === 'dark') {
      return `rgba(255, 255, 255, ${opacity})`;
    }
    return `rgba(255, 255, 255, ${opacity})`;
  };

  const getBorderColor = (): string => {
    if (mode === 'dark') {
      return 'rgba(255, 255, 255, 0.15)';
    }
    return 'rgba(255, 255, 255, 0.5)';
  };

  const getShadowStyle = (): ViewStyle => {
    if (mode === 'dark') {
      return {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      };
    }
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    };
  };

  return (
    <View
      style={[
        styles.container,
        getShadowStyle(),
        {
          backgroundColor: getGlassBackground(),
          borderColor: getBorderColor(),
          borderRadius,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    overflow: 'hidden',
  },
});
