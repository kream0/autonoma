import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage, Language, LanguageInfo } from '../../context/LanguageContext';

interface LanguageSelectorProps {
  style?: ViewStyle;
  variant?: 'segmented' | 'dropdown';
  showNativeName?: boolean;
}

export function LanguageSelector({
  style,
  variant = 'segmented',
  showNativeName = true,
}: LanguageSelectorProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { language, setLanguage, supportedLanguages } = useLanguage();

  const handleLanguageSelect = async (lang: Language) => {
    if (lang !== language) {
      await setLanguage(lang);
    }
  };

  const getDisplayName = (langInfo: LanguageInfo): string => {
    if (showNativeName) {
      return langInfo.nativeName;
    }
    return langInfo.name;
  };

  if (variant === 'segmented') {
    return (
      <View
        style={[
          styles.segmentedContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        {supportedLanguages.map((langInfo, index) => {
          const isSelected = language === langInfo.code;
          const isFirst = index === 0;
          const isLast = index === supportedLanguages.length - 1;

          return (
            <TouchableOpacity
              key={langInfo.code}
              onPress={() => handleLanguageSelect(langInfo.code)}
              activeOpacity={0.7}
              style={[
                styles.segmentedButton,
                {
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                  borderTopLeftRadius: isFirst ? 10 : 0,
                  borderBottomLeftRadius: isFirst ? 10 : 0,
                  borderTopRightRadius: isLast ? 10 : 0,
                  borderBottomRightRadius: isLast ? 10 : 0,
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentedText,
                  {
                    color: isSelected ? '#FFFFFF' : colors.text,
                    fontWeight: isSelected ? '600' : '400',
                  },
                ]}
              >
                {getDisplayName(langInfo)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Dropdown variant - simplified inline dropdown
  return (
    <View style={[styles.dropdownContainer, style]}>
      {supportedLanguages.map((langInfo) => {
        const isSelected = language === langInfo.code;

        return (
          <TouchableOpacity
            key={langInfo.code}
            onPress={() => handleLanguageSelect(langInfo.code)}
            activeOpacity={0.7}
            style={[
              styles.dropdownItem,
              {
                backgroundColor: isSelected ? colors.primary + '20' : 'transparent',
                borderColor: isSelected ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.dropdownText,
                {
                  color: isSelected ? colors.primary : colors.text,
                  fontWeight: isSelected ? '600' : '400',
                },
              ]}
            >
              {getDisplayName(langInfo)}
            </Text>
            {isSelected && (
              <View
                style={[
                  styles.checkmark,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedText: {
    fontSize: 14,
  },
  dropdownContainer: {
    gap: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dropdownText: {
    fontSize: 16,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
