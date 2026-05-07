import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import Theme from '../context/ThemeContext';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { clearAuthStorage } from '../utils/authFlow';

export default function LogoutButton() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const handleLogout = async () => {
        try {
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                api.setToken(token);
                try { await api.logout(); } catch { /* server-side logout errors are non-fatal */ }
            }
        } finally {
            await clearAuthStorage();
            router.replace('/(auth)/login');
        }
    };

    return (
        <TouchableOpacity
            onPress={handleLogout}
            style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: colors.error + '18',
                borderWidth: 1,
                borderColor: colors.error + '40',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
            }}
        >
            <FontAwesome name="sign-out" size={14} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 14, fontWeight: '500' }}>Sign Out</Text>
        </TouchableOpacity>
    );
}
