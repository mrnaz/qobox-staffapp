import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Theme from '../../context/ThemeContext';

export default function TestsTab({ classId, onOpenProgressReports, onOpenSchedule }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const cards = [
        {
            id: 'progress',
            title: 'Reports',
            subtitle: 'View and fill student reports for this class.',
            icon: 'document-text-outline',
            onPress: onOpenProgressReports,
        },
        {
            id: 'schedule',
            title: 'Schedule Tests',
            subtitle: 'Create and manage tests for this class.',
            icon: 'calendar-outline',
            onPress: onOpenSchedule,
        },
    ];

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {cards.map((card) => (
                <TouchableOpacity
                    key={card.id}
                    activeOpacity={0.85}
                    onPress={card.onPress}
                    style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                >
                    <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
                        <Ionicons name={card.icon} size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                            {card.title}
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                            {card.subtitle}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 10, paddingBottom: 32 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
    },
    iconWrap: {
        width: 44, height: 44, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 15, fontWeight: '700' },
    subtitle: { fontSize: 12, lineHeight: 17 },
});
