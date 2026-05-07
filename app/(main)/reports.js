import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { ensureAcademicPeriod } from '../utils/academicPeriod';

const formatDate = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ReportsScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [period, setPeriod] = useState(null);
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const debounceRef = useRef(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [search]);

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');

                let activePeriod = period;
                if (!activePeriod) {
                    const { id, period: p } = await ensureAcademicPeriod();
                    if (!id) {
                        setItems([]);
                        setError('No academic period available.');
                        return;
                    }
                    activePeriod = p;
                    setPeriod(p);
                }

                const params = { period_id: activePeriod.id };
                if (debouncedSearch) params.search = debouncedSearch;
                const res = await api.getReportClassesCourses(params);
                setItems(Array.isArray(res) ? res : []);
            } catch (err) {
                console.error('Reports load error', err);
                setError(err.body?.message || err.message || 'Failed to load reports.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [period, debouncedSearch]
    );

    useEffect(() => {
        load();
    }, [debouncedSearch]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const renderItem = ({ item }) => {
        const isClass = Boolean(item.class_title);
        const tagColor = isClass ? colors.primary : (colors.warning || colors.primary);
        return (
            <TouchableOpacity
                style={[styles.row, { borderColor: 'rgba(127,127,127,0.18)' }]}
                onPress={() => {
                    // Drill-down (student list per class) is Tier 2 for this feature.
                }}
                activeOpacity={0.7}
            >
                <View style={styles.rowHeader}>
                    <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                        {item.course_title || 'Untitled course'}
                    </Text>
                    <View style={[styles.tag, { backgroundColor: tagColor + '22', borderColor: tagColor }]}>
                        <Text style={[styles.tagText, { color: tagColor }]}>
                            {isClass ? 'Class' : 'Course'}
                        </Text>
                    </View>
                </View>

                {item.class_title ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.class_title}
                    </Text>
                ) : null}

                {item.schedule_label ? (
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.schedule_label}
                    </Text>
                ) : null}

                <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                        <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Scheduled</Text>
                        <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                            {formatDate(item.reports_scheduled)}
                        </Text>
                    </View>
                    <View style={styles.metaCol}>
                        <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Due</Text>
                        <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                            {formatDate(item.reports_due)}
                        </Text>
                    </View>
                    <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
                        <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Progress</Text>
                        <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                            {(item.completed_count ?? 0)} / {(item.student_count ?? 0)}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const headerSubtitle = useMemo(() => {
        if (!period) return null;
        return period.label || period.description || `Period #${period.id}`;
    }, [period]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {headerSubtitle ? (
                <View style={styles.periodWrap}>
                    <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>
                        {headerSubtitle}
                    </Text>
                </View>
            ) : null}

            <View style={styles.searchWrap}>
                <View
                    style={[
                        styles.searchInputContainer,
                        { backgroundColor: colors.card || 'rgba(127,127,127,0.12)' },
                    ]}
                >
                    <Ionicons name="search" size={18} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        placeholder="Search reports"
                        placeholderTextColor={colors.textSecondary}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {search ? (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {isLoading && items.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item, idx) =>
                        String(item.id ?? `${item.course_title || ''}-${item.class_title || ''}-${idx}`)
                    }
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {debouncedSearch ? 'No reports match your search.' : 'No scheduled reports yet.'}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    periodWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
    periodLabel: { fontSize: 12, fontWeight: '500' },
    searchWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
    },
    searchInput: { flex: 1, fontSize: 15, padding: 0 },
    listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    row: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
    },
    rowHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    title: { flex: 1, fontSize: 16, fontWeight: '600' },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
    },
    tagText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    subtitle: { fontSize: 13, marginTop: 4 },
    meta: { fontSize: 12, marginTop: 2 },
    metaRow: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 12,
    },
    metaCol: { flex: 1 },
    metaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    metaValue: { fontSize: 14, fontWeight: '600', marginTop: 2 },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
});
