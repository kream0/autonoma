import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { SUPPORTED_COUNTRIES, CountryCode } from '../../constants';
import { GlassCard } from './GlassCard';

interface CountryPickerProps {
  selectedCountry: CountryCode;
  onSelectCountry: (country: CountryCode) => void;
  style?: ViewStyle;
  disabled?: boolean;
}

interface CountryItem {
  code: CountryCode;
  name: string;
  phoneCode: string;
  flag: string;
}

const COUNTRY_FLAGS: Record<CountryCode, string> = {
  SN: '🇸🇳',
  CI: '🇨🇮',
  MR: '🇲🇷',
  FR: '🇫🇷',
};

const getCountryList = (): CountryItem[] => {
  return (Object.keys(SUPPORTED_COUNTRIES) as CountryCode[]).map((code) => ({
    code,
    name: SUPPORTED_COUNTRIES[code].name,
    phoneCode: SUPPORTED_COUNTRIES[code].phoneCode,
    flag: COUNTRY_FLAGS[code],
  }));
};

export function CountryPicker({
  selectedCountry,
  onSelectCountry,
  style,
  disabled = false,
}: CountryPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme } = useTheme();
  const { colors } = theme;

  const countries = getCountryList();
  const selected = SUPPORTED_COUNTRIES[selectedCountry];

  const handleSelect = (code: CountryCode) => {
    onSelectCountry(code);
    setModalVisible(false);
  };

  const renderCountryItem = ({ item }: { item: CountryItem }) => (
    <TouchableOpacity
      style={[
        styles.countryItem,
        {
          backgroundColor:
            item.code === selectedCountry ? colors.surface : 'transparent',
        },
      ]}
      onPress={() => handleSelect(item.code)}
    >
      <Text style={styles.flag}>{item.flag}</Text>
      <View style={styles.countryInfo}>
        <Text style={[styles.countryName, { color: colors.text }]}>
          {item.name}
        </Text>
        <Text style={[styles.phoneCode, { color: colors.textSecondary }]}>
          {item.phoneCode}
        </Text>
      </View>
      {item.code === selectedCountry && (
        <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        style={[
          styles.selector,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
        onPress={() => !disabled && setModalVisible(true)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={styles.selectorFlag}>{COUNTRY_FLAGS[selectedCountry]}</Text>
        <View style={styles.selectorInfo}>
          <Text style={[styles.selectorCountry, { color: colors.text }]}>
            {selected.name}
          </Text>
          <Text style={[styles.selectorCode, { color: colors.textSecondary }]}>
            {selected.phoneCode}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <GlassCard
              style={styles.modalCard}
              blur="heavy"
              padding={0}
              borderRadius={20}
            >
              <View
                style={[styles.modalHeader, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Select Country
                </Text>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.closeButton}
                >
                  <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={countries}
                renderItem={renderCountryItem}
                keyExtractor={(item) => item.code}
                style={styles.countryList}
              />
            </GlassCard>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectorFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  selectorInfo: {
    flex: 1,
  },
  selectorCountry: {
    fontSize: 16,
    fontWeight: '500',
  },
  selectorCode: {
    fontSize: 14,
    marginTop: 2,
  },
  chevron: {
    fontSize: 12,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
  },
  modalCard: {
    maxHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 20,
    fontWeight: '300',
  },
  countryList: {
    maxHeight: 320,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  flag: {
    fontSize: 28,
    marginRight: 16,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    fontSize: 16,
    fontWeight: '500',
  },
  phoneCode: {
    fontSize: 14,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});
