/**
 * Forgot Password Screen
 * Email input with password reset functionality via Firebase
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { validateEmail } from '../../utils/validation';
import type { AuthStackParamList } from './_layout';

type ForgotPasswordNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<ForgotPasswordNavigationProp>();
  const { resetPassword, error: authError, clearError } = useAuth();
  const { theme } = useTheme();
  const { colors } = theme;

  // Form state
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validate email
  const validateForm = useCallback((): boolean => {
    if (!email.trim()) {
      setEmailError('L\'email est requis');
      return false;
    }
    if (!validateEmail(email)) {
      setEmailError('Email invalide');
      return false;
    }
    setEmailError(null);
    return true;
  }, [email]);

  // Handle password reset
  const handleResetPassword = useCallback(async () => {
    clearError();
    setIsSuccess(false);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword(email.trim());
      setIsSuccess(true);
      Alert.alert(
        'Email envoye',
        'Un lien de reinitialisation a ete envoye a votre adresse email. Verifiez votre boite de reception.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Echec de l\'envoi';
      Alert.alert('Erreur', message);
    } finally {
      setIsLoading(false);
    }
  }, [email, resetPassword, validateForm, clearError]);

  // Navigate back to login
  const handleBackToLogin = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

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
          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={handleBackToLogin}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="lock-open-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Mot de passe oublie?</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Entrez votre adresse email et nous vous enverrons un lien pour reinitialiser votre mot de passe.
            </Text>
          </View>

          {/* Reset Form */}
          <GlassCard style={styles.formCard}>
            {/* Success State */}
            {isSuccess && (
              <View style={[styles.successContainer, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                <Text style={[styles.successText, { color: colors.success }]}>
                  Email de reinitialisation envoye!
                </Text>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Email</Text>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: emailError ? colors.error : colors.border,
                  },
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="votre@email.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setEmailError(null);
                    setIsSuccess(false);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>
              {emailError && (
                <Text style={[styles.errorText, { color: colors.error }]}>{emailError}</Text>
              )}
            </View>

            {/* Auth Error */}
            {authError && (
              <Text style={[styles.authError, { color: colors.error }]}>{authError}</Text>
            )}

            {/* Reset Button */}
            <Button
              title={isLoading ? 'Envoi en cours...' : 'Envoyer le lien'}
              onPress={handleResetPassword}
              variant="primary"
              size="large"
              fullWidth
              loading={isLoading}
              disabled={isLoading}
            />
          </GlassCard>

          {/* Back to Login Link */}
          <View style={styles.loginContainer}>
            <TouchableOpacity onPress={handleBackToLogin} style={styles.loginLink}>
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={[styles.loginLinkText, { color: colors.primary }]}>
                Retour a la connexion
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  formCard: {
    padding: 24,
    gap: 20,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  authError: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  loginContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  loginLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loginLinkText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
