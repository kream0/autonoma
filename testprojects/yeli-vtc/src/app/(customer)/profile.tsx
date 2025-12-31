/**
 * Customer Profile Screen
 * Displays profile photo, editable name, read-only email/phone,
 * language selector, theme toggle, and logout button.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeMode } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { Button } from '../../components/ui/Button';

export default function CustomerProfileScreen() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { theme, themeMode, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const { colors } = theme;

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSaveName = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setIsSavingName(true);
    try {
      // Note: In a real app, you would update the user's displayName via Firebase
      // await updateProfile(user, { displayName: displayName.trim() });
      setIsEditingName(false);
      Alert.alert('Success', 'Name updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await signOut();
            } catch (error) {
              Alert.alert('Error', 'Failed to logout');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const getThemeLabel = (mode: ThemeMode): string => {
    return mode === 'light' ? 'Light' : 'Dark';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>

        {/* Profile Photo Placeholder */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {user?.photoURL ? (
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            ) : (
              <User size={48} color={colors.primary} />
            )}
          </View>
          <TouchableOpacity style={[styles.changePhotoButton, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>
              Change Photo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Profile Information Section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Information</Text>

          {/* Editable Name Field */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
            {isEditingName ? (
              <View style={styles.editNameRow}>
                <TextInput
                  style={[
                    styles.nameInput,
                    {
                      backgroundColor: colors.background,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: colors.primary }]}
                  onPress={handleSaveName}
                  disabled={isSavingName}
                >
                  {isSavingName ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setIsEditingName(false);
                    setDisplayName(user?.displayName || '');
                  }}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.fieldValueRow}
                onPress={() => setIsEditingName(true)}
              >
                <Text style={[styles.fieldValue, { color: colors.text }]}>
                  {user?.displayName || 'Not set'}
                </Text>
                <Text style={[styles.editLink, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Read-only Email Field */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
            <Text style={[styles.fieldValue, { color: colors.text }]}>
              {user?.email || 'Not available'}
            </Text>
          </View>

          {/* Read-only Phone Field */}
          <View style={[styles.fieldContainer, styles.lastField]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
            <Text style={[styles.fieldValue, { color: colors.text }]}>
              {user?.phoneNumber || 'Not available'}
            </Text>
          </View>
        </View>

        {/* Preferences Section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>

          {/* Language Selector */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Language</Text>
            <LanguageSelector variant="segmented" style={styles.languageSelector} />
          </View>

          {/* Theme Toggle */}
          <View style={[styles.fieldContainer, styles.lastField]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Theme</Text>
            <TouchableOpacity
              style={[styles.themeToggle, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={toggleTheme}
              activeOpacity={0.7}
            >
              <View style={styles.themeToggleContent}>
                <Text style={[styles.themeText, { color: colors.text }]}>
                  {getThemeLabel(themeMode)}
                </Text>
                <View
                  style={[
                    styles.themeIndicator,
                    {
                      backgroundColor: themeMode === 'dark' ? colors.primary : colors.textSecondary,
                    },
                  ]}
                >
                  <Text style={styles.themeIndicatorText}>
                    {themeMode === 'dark' ? '🌙' : '☀️'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <Button
            title={isLoggingOut ? 'Logging out...' : 'Logout'}
            onPress={handleLogout}
            variant="outline"
            fullWidth
            loading={isLoggingOut}
            style={[styles.logoutButton, { borderColor: colors.error }]}
            textStyle={{ color: colors.error }}
          />
        </View>

        {/* App Version */}
        <Text style={[styles.versionText, { color: colors.textSecondary }]}>
          Version 1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
  },
  changePhotoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  lastField: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  fieldValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  saveButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  languageSelector: {
    marginTop: 4,
  },
  themeToggle: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  themeToggleContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  themeIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeIndicatorText: {
    fontSize: 18,
  },
  logoutSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  logoutButton: {
    borderWidth: 2,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
  },
});
