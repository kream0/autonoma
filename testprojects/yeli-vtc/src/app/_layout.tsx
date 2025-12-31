/**
 * Root Layout - Main App Entry Point
 * Provides navigation structure and context providers
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { LanguageProvider } from '../context/LanguageContext';
import { RideProvider } from '../context/RideContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Import layouts
import AuthLayout from './(auth)/_layout';
import CustomerLayout from './(customer)/_layout';
import DriverLayout from './(driver)/_layout';

// Loading Screen
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';

export type RootStackParamList = {
  Auth: undefined;
  Customer: undefined;
  Driver: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Loading screen component
 */
function LoadingScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
      <Text style={[styles.loadingLogo, { color: colors.primary }]}>Yeli VTC</Text>
      <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Chargement...</Text>
    </View>
  );
}

/**
 * Navigation container with auth state handling
 */
function AppNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { theme, isLoading: themeLoading } = useTheme();
  const [userRole, setUserRole] = useState<'customer' | 'driver' | null>(null);

  // Determine user role based on stored data
  // In a real app, this would come from Firestore user document
  useEffect(() => {
    if (user) {
      // Default to customer for now - in production, fetch from Firestore
      setUserRole('customer');
    } else {
      setUserRole(null);
    }
  }, [user]);

  // Show loading while auth or theme is initializing
  if (authLoading || themeLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        {!user ? (
          // Not logged in - show auth screens
          <Stack.Screen name="Auth" component={AuthLayout} />
        ) : userRole === 'driver' ? (
          // Driver logged in - show driver screens
          <Stack.Screen name="Driver" component={DriverLayout} />
        ) : (
          // Customer logged in - show customer screens
          <Stack.Screen name="Customer" component={CustomerLayout} />
        )}
      </Stack.Navigator>
    </>
  );
}

/**
 * Root layout with all providers
 */
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <RideProvider>
                <NavigationContainer>
                  <AppNavigator />
                </NavigationContainer>
              </RideProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 24,
  },
  loadingIndicator: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
  },
});
