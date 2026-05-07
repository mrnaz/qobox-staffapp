import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';

const fmtDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function LessonsTab({ classId }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [lessons, setLessons] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const res = await api.getClassLessons(classId);
                const list = res?.lessons || res?.data || res || [];
                setLessons(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Lessons load error', err);
                setError(err.body?.message || err.message || 'Failed to load lessons.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [classId]
    );

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity
            onPress={() =>
                router.push({
                    pathname: `/class/${classId}/lesson/${item.id}`,
                    params: { lesson: JSON.stringify(item) },
                })
            }
            activeOpacity={0.8}
            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
        >
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.title || `Lesson #${item.id}`}
                </Text>
                {item.lesson_date || item.date ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {fmtDate(item.lesson_date || item.date)}
                    </Text>
                ) : null}
                {item.duration_minutes ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {item.duration_minutes} min
                    </Text>
                ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
    );

    if (isLoading && lessons.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && lessons.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <FlatList
            data={lessons}
            keyExtractor={(it, i) => String(it.id ?? i)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="book-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No lessons yet.</Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
    },
    title: { fontSize: 14, fontWeight: '600' },
    subtitle: { fontSize: 12 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
