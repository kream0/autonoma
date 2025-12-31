/**
 * Register Screen
 * User registration with email, password, phone, name, and role selection
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { validateEmail, validateName, validatePhone } from '../../utils/validation';
import type { AuthStackParamList } from './_layout';

type RegisterNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

interface CountryCode {
  code: string;
  prefix: string;
  name: string;
  flag: string;
}

const COUNTRY_CODES: CountryCode[] = [
  { code: 'SN', prefix: '+221', name: 'Senegal', flag: '🇸🇳' },
  { code: 'CI', prefix: '+225', name: 'Cote d\'Ivoire', flag: '🇨🇮' },
  { code: 'MR', prefix: '+222', name: 'Mauritanie', flag: '🇲🇷' },
  { code: 'FR', prefix: '+33', name: 'France', flag: '🇫🇷' },
];

type UserRole = 'customer' | 'driver';

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

export default function RegisterScreen() {
  const navigation = useNavigation<RegisterNavigationProp>();
  const { signUp, error: authError, clearError } = useAuth();
  const { theme } = useTheme();
  const { colors } = theme;

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'Le prenom est requis';
    } else if (!validateName(firstName)) {
      newErrors.firstName = 'Prenom invalide';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Le nom est requis';
    } else if (!validateName(lastName)) {
      newErrors.lastName = 'Nom invalide';
    }

    if (!email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Email invalide';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Le numero de telephone est requis';
    } else if (!validatePhone(phone, selectedCountry.code)) {
      newErrors.phone = 'Numero de telephone invalide';
    }

    if (!password) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (password.length < 6) {
      newErrors.password = 'Le mot de passe doit contenir au moins 6 caracteres';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Veuillez confirmer le mot de passe';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [firstName, lastName, email, phone, password, confirmPassword, selectedCountry.code]);

  // Handle registration
  const handleRegister = useCallback(async () => {
    clearError();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await signUp(email.trim(), password);
      // TODO: After signUp, store additional user data (firstName, lastName, phone, role)
      // in Firestore or another database
      // Navigation will happen automatically via auth state change
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Inscription echouee';
      Alert.alert('Erreur', message);
    } finally {
      setIsLoading(false);
    }
  }, [email, password, signUp, validateForm, clearError]);

  // Navigate to login
  const handleLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  // Render country picker item
  const renderCountryItem = ({ item }: { item: CountryCode }) => (
    <TouchableOpacity
      style={[styles.countryItem, { borderBottomColor: colors.border }]}
      onPress={() => {
        setSelectedCountry(item);
        setShowCountryPicker(false);
      }}
    >
      <Text style={styles.countryFlag}>{item.flag}</Text>
      <Text style={[styles.countryName, { color: colors.text }]}>{item.name}</Text>
      <Text style={[styles.countryPrefix, { color: colors.textSecondary }]}>{item.prefix}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleLogin}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.logo, { color: colors.primary }]}>Yeli VTC</Text>
            <Text style={[styles.title, { color: colors.text }]}>Creer un compte</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Rejoignez-nous pour commencer
            </Text>
          </View>

          {/* Registration Form */}
          <GlassCard style={styles.formCard}>
            {/* Name Fields Row */}
            <View style={styles.nameRow}>
              {/* First Name */}
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Prenom</Text>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: colors.surface,
                      borderColor: errors.firstName ? colors.error : colors.border,
                    },
                  ]}
                >
                  <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Prenom"
                    placeholderTextColor={colors.textSecondary}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
                {errors.firstName && (
                  <Text style={[styles.errorText, { color: colors.error }]}>{errors.firstName}</Text>
                )}
              </View>

              {/* Last Name */}
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Nom</Text>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: colors.surface,
                      borderColor: errors.lastName ? colors.error : colors.border,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Nom"
                    placeholderTextColor={colors.textSecondary}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
                {errors.lastName && (
                  <Text style={[styles.errorText, { color: colors.error }]}>{errors.lastName}</Text>
                )}
              </View>
            </View>

            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Email</Text>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: errors.email ? colors.error : colors.border,
                  },
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="votre@email.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.email}</Text>
              )}
            </View>

            {/* Phone Input with Country Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Telephone</Text>
              <View style={styles.phoneRow}>
                {/* Country Code Selector */}
                <TouchableOpacity
                  style={[
                    styles.countrySelector,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={[styles.countryPrefixText, { color: colors.text }]}>
                    {selectedCountry.prefix}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Phone Number Input */}
                <View
                  style={[
                    styles.phoneInputContainer,
                    {
                      backgroundColor: colors.surface,
                      borderColor: errors.phone ? colors.error : colors.border,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Numero de telephone"
                    placeholderTextColor={colors.textSecondary}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              {errors.phone && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.phone}</Text>
              )}
            </View>

            {/* Role Selection */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Je suis</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    {
                      backgroundColor: role === 'customer' ? colors.primary : colors.surface,
                      borderColor: role === 'customer' ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setRole('customer')}
                >
                  <Ionicons
                    name="person"
                    size={24}
                    color={role === 'customer' ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.roleText,
                      { color: role === 'customer' ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    Passager
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    {
                      backgroundColor: role === 'driver' ? colors.primary : colors.surface,
                      borderColor: role === 'driver' ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setRole('driver')}
                >
                  <Ionicons
                    name="car"
                    size={24}
                    color={role === 'driver' ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.roleText,
                      { color: role === 'driver' ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    Chauffeur
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Mot de passe</Text>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: errors.password ? colors.error : colors.border,
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Mot de passe"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.password}</Text>
              )}
            </View>

            {/* Confirm Password Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Confirmer mot de passe</Text>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: errors.confirmPassword ? colors.error : colors.border,
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Confirmer mot de passe"
                  placeholderTextColor={colors.textSecondary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.confirmPassword}</Text>
              )}
            </View>

            {/* Auth Error */}
            {authError && (
              <Text style={[styles.authError, { color: colors.error }]}>{authError}</Text>
            )}

            {/* Register Button */}
            <Button
              title={isLoading ? 'Inscription...' : 'S\'inscrire'}
              onPress={handleRegister}
              variant="primary"
              size="large"
              fullWidth
              loading={isLoading}
              disabled={isLoading}
            />
          </GlassCard>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={[styles.loginText, { color: colors.textSecondary }]}>
              Deja un compte?
            </Text>
            <TouchableOpacity onPress={handleLogin}>
              <Text style={[styles.loginLink, { color: colors.primary }]}> Connectez-vous</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Choisir un pays</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code}
              renderItem={renderCountryItem}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  formCard: {
    padding: 20,
    gap: 16,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  errorText: {
    fontSize: 11,
    marginTop: 2,
  },
  authError: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  countryFlag: {
    fontSize: 18,
  },
  countryPrefixText: {
    fontSize: 14,
    fontWeight: '500',
  },
  phoneInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  countryName: {
    flex: 1,
    fontSize: 16,
  },
  countryPrefix: {
    fontSize: 14,
  },
});
