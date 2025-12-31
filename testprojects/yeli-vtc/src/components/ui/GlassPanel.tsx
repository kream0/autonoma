import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface GlassPanelProps {
  children: ReactNode;
  style?: ViewStyle;
  blur?: 'light' | 'medium' | 'heavy';
  padding?: number;
  position?: 'top' | 'bottom' | 'floating';
}

export function GlassPanel({
  children,
  style,
  blur = 'medium',
  padding = 20,
  position = 'floating',
}: GlassPanelProps) {
  const { theme } = useTheme();
  const { mode } = theme;

  const getGlassBackground = (): string => {
    const baseOpacity = mode === 'dark' ? 0.25 : 0.85;
    const opacityMultiplier = {
      light: 0.7,
      medium: 1,
      heavy: 1.2,
    };
    const opacity = Math.min(baseOpacity * opacityMultiplier[blur], 0.95);

    if (mode === 'dark') {
      return `rgba(30, 30, 30, ${opacity})`;
    }
    return `rgba(255, 255, 255, ${opacity})`;
  };

  const getBorderColor = (): string => {
    if (mode === 'dark') {
      return 'rgba(255, 255, 255, 0.1)';
    }
    return 'rgba(0, 0, 0, 0.05)';
  };

  const getPositionStyle = (): ViewStyle => {
    switch (position) {
      case 'top':
        return {
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          borderTopWidth: 0,
        };
      case 'bottom':
        return {
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottomWidth: 0,
        };
      case 'floating':
      default:
        return {
          borderRadius: 24,
        };
    }
  };

  const getShadowStyle = (): ViewStyle => {
    if (mode === 'dark') {
      return {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
      };
    }
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    };
  };

  return (
    <View
      style={[
        styles.container,
        getPositionStyle(),
        getShadowStyle(),
        {
          backgroundColor: getGlassBackground(),
          borderColor: getBorderColor(),
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
