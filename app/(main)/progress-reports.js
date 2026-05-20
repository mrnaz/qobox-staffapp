import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { ensureAcademicPeriod } from '../utils/academicPeriod';

// Cross-class progress-reports landing page. For every class the staff
// teaches we fetch its linked report templates + filled results so the
// user can jump straight to "the class where there's work to do".
export default function ProgressReportsScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [period, setPeriod] = useState(null);
    const [rows, setRows] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            const s = await AsyncStorage.getItem('staff');
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setProfileLoaded(true);
        })();
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            if (!staff?.id) return;
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                let activePeriod = period;
                if (!activePeriod) {
                    const { period: p } = await ensureAcademicPeriod();
                    activePeriod = p;
                    setPeriod(p);
                }
                const classesRes = await api.getStaffClasses(staff.id, {
                    academic_period: activePeriod?.id,
                });
                const classes = classesRes?.classes || classesRes?.data || classesRes || [];

                // For each class, look up linked templates + results in parallel.
                // We swallow per-class errors so one bad class doesn't break the
                // whole list.
                const settled = await Promise.allSettled(
                    classes.map(async (cls) => {
                        const classId = cls.id ?? cls.class_id;
                        const [tplRes, resRes] = await Promise.all([
                            api.getClassProgressReports(classId).catch(() => null),
                            api.getClassProgressReportResults(classId).catch(() => null),
                        ]);
                        const templates = tplRes?.progress_reports || [];
                        const results =
                            resRes?.data ||
                            (Array.isArray(resRes) ? resRes : []) ||
                            [];

                        let drafts = 0;
                        let completed = 0;
                        let lastAt = null;
                        for (const r of results) {
                            if (r.completed) completed++;
                            else drafts++;
                            const t = r.updated_at || r.created_at;
                            if (t && (!lastAt || new Date(t) > new Date(lastAt))) lastAt = t;
                        }

                        return {
                            classId,
                            title: cls.title || cls.class_title || 'Class',
                            course: Array.isArray(cls.course_title)
                                ? cls.course_title.join(', ')
                                : cls.course_title,
                            template_count: templates.length,
                            results_count: results.length,
                            drafts,
                            completed,
                            last_at: lastAt,
                        };
                    })
                );

                const enriched = settled
                    .filter((s) => s.status === 'fulfilled')
                    .map((s) => s.value)
                    // Show classes that actually have a report template linked first;
                    // dropping the unlinked ones keeps this screen focused on work
                    // the staff can do.
                    .filter((r) => r.template_count > 0)
                    .sort((a, b) => {
                        // Drafts first, then by most recent activity
                        if ((b.drafts > 0) !== (a.drafts > 0)) return b.drafts - a.drafts;
                        const ta = a.last_at ? new Date(a.last_at).getTime() : 0;
                        const tb = b.last_at ? new Date(b.last_at).getTime() : 0;
                        return tb - ta;
                    });

                setRows(enriched);
            } catch (err) {
                console.error('Progress reports landing load error', err);
                setError(err.body?.message || err.message || 'Failed to load progress reports.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [staff, period]
    );

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => ({
                templates: acc.templates + r.template_count,
                drafts: acc.drafts + r.drafts,
                completed: acc.completed + r.completed,
            }),
            { templates: 0, drafts: 0, completed: 0 }
        );
    }, [rows]);

    if (profileLoaded && !staff?.id) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Ionicons name="person-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No profile loaded. Please sign in again.
                    </Text>
                </View>
            </View>
        );
    }

    const renderItem = ({ item }) => (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push(`/class/${item.classId}/progress-reports`)}
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
        >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
                <FontAwesome name="file-text-o" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                </Text>
                {item.course ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.course}
                    </Text>
                ) : null}
                <View style={styles.metaRow}>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                        {item.template_count} report{item.template_count === 1 ? '' : 's'}
                    </Text>
                    {item.drafts ? (
                        <View style={[styles.chip, { backgroundColor: (colors.warning || colors.primary) + '22' }]}>
                            <Text style={[styles.chipText, { color: colors.warning || colors.primary }]}>
                                {item.drafts} draft
                            </Text>
                        </View>
                    ) : null}
                    {item.completed ? (
                        <View style={[styles.chip, { backgroundColor: (colors.success || colors.primary) + '22' }]}>
                            <Text style={[styles.chipText, { color: colors.success || colors.primary }]}>
                                {item.completed} done
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {rows.length > 0 ? (
                <View style={[styles.summaryRow, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                    <Stat label="Templates" value={totals.templates} colors={colors} />
                    <Stat
                        label="Drafts"
                        value={totals.drafts}
                        color={totals.drafts ? (colors.warning || colors.primary) : undefined}
                        colors={colors}
                    />
                    <Stat
                        label="Completed"
                        value={totals.completed}
                        color={totals.completed ? (colors.success || colors.primary) : undefined}
                        colors={colors}
                    />
                </View>
            ) : null}

            {isLoading && rows.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && rows.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(it) => String(it.classId)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <FontAwesome name="file-text-o" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                None of your classes have progress reports linked yet.
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

function Stat({ label, value, color, colors }) {
    return (
        <View style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ color: color || colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                {value}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
                {label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    summaryRow: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 12,
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        paddingVertical: 8,
    },
    list: { padding: 16, paddingTop: 8, paddingBottom: 32, gap: 10 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
    },
    iconWrap: {
        width: 40, height: 40, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 14, fontWeight: '700' },
    subtitle: { fontSize: 12 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
    meta: { fontSize: 11 },
    chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    chipText: { fontSize: 10, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
