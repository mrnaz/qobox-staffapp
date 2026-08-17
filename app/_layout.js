import { useEffect, useState } from 'react';
import { View } from 'react-native';
import React from 'react';
import Theme from './context/ThemeContext';
import { Stack, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './services/api';

const { ThemeProvider } = Theme;

const STACK_OPTIONS = { headerShown: false };

const useProtectedRoute = () => {
    const segments = useSegments();
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                if (segments.length === 0) return;
                const inAuthGroup = segments[0] === '(auth)';
                const token = await AsyncStorage.getItem('accessToken');
                // Restore the API token here rather than only on the index
                // route: booting straight into any other route (a web refresh
                // on a detail screen, a deep link) would otherwise leave the
                // client unauthenticated and 401 every request.
                if (token) api.setToken(token);
                if (!token && !inAuthGroup) {
                    router.replace('/(auth)/login');
                }
                // Note: do NOT auto-redirect authenticated users out of (auth).
                // The (auth) group includes intermediate flows (otp, select-site)
                // that the user may need to revisit.
            } catch (error) {
                console.error('Auth check error', error);
            } finally {
                setIsChecking(false);
            }
        };
        checkAuth();
    }, [segments]);

    return isChecking;
};

const RootLayoutInner = React.memo(function RootLayoutInner() {
    const isChecking = useProtectedRoute();
    if (isChecking) return <View style={{ flex: 1 }} />;
    return <Stack screenOptions={STACK_OPTIONS} />;
});

export default function RootLayout() {
    return (
        <ThemeProvider>
            <RootLayoutInner />
        </ThemeProvider>
    );
}
