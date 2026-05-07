import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';
import PlaceholderScreen from '../components/PlaceholderScreen';

export default function MessagesScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Messages</Text>
                <View style={{ width: 40 }} />
            </View>

            <PlaceholderScreen
                icon="mail-outline"
                title="Messages"
                description="Inbox, conversations, and unread badge."
                bullets={[
                    'View threads',
                    'Compose new message',
                    'Reply to conversations',
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
    },
    iconButton: { padding: 8, borderRadius: 999 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
});
