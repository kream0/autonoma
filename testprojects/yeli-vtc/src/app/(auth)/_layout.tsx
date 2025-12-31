/**
 * Auth Layout
 * Stack navigation for authentication screens: Login, Register, OTP, ForgotPassword
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './login';
import RegisterScreen from './register';
import OTPScreen from './otp';
import ForgotPasswordScreen from './forgot-password';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  OTP: { phoneNumber: string; verificationId: string };
  ForgotPassword: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthLayout() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
      initialRouteName="Login"
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
