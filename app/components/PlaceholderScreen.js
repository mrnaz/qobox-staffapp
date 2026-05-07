import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';

export default function PlaceholderScreen({
    icon = 'cube-outline',
    title,
    description,
    bullets = [],
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={styles.container}
        >
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
                    <Ionicons name={icon} size={28} color={colors.primary} />
                </View>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                {description ? (
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        {description}
                    </Text>
                ) : null}

                {bullets.length > 0 ? (
                    <View style={styles.bullets}>
                        {bullets.map((b, i) => (
                            <View key={i} style={styles.bulletRow}>
                                <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
                                <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{b}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}

                <View style={[styles.tagline, { borderColor: colors.border }]}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.taglineText, { color: colors.textSecondary }]}>Coming soon</Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20 },
    card: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
    },
    iconWrap: {
        width: 56, height: 56, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
    },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
    description: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 6 },
    bullets: { alignSelf: 'stretch', marginTop: 16, gap: 10 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
    bulletText: { flex: 1, fontSize: 14, lineHeight: 20 },
    tagline: {
        marginTop: 18,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    taglineText: { fontSize: 12, fontWeight: '500' },
});
