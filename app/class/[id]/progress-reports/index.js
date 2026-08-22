import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useGoBack } from '../../../utils/nav';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { iconColor } from '../../../utils/iconColors';
import api from '../../../services/api';
import Theme from '../../../context/ThemeContext';
import Card, { cardGap } from '../../../components/Card';

// Per-class report list. Each row is one progress-report template linked to
// the class; tapping it drills into the student roster for that report.
// Matches the spec flow: list of reports → tap → list of students.
export default function ProgressReportsListScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id: classId } = useLocalSearchParams();
    const router = useRouter();
    const goBack = useGoBack(`/class/${classId}`);
    const insets = useSafeAreaInsets();

    const [templates, setTemplates] = useState([]);
    const [results, setResults] = useState([]); // class-wide filled results, used for per-report counts
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const [tplRes, resRes] = await Promise.all([
                    api.getClassProgressReports(classId),
                    api.getClassProgressReportResults(classId),
                ]);
                setTemplates(tplRes?.progress_reports || []);
                const list = resRes?.data || (Array.isArray(resRes) ? resRes : []) || [];
                setResults(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Progress reports load error', err);
                setError(err.body?.message || err.message || 'Failed to load progress reports.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [classId]
    );

    useEffect(() => { load(); }, [load]);
    useFocusEffect(useCallback(() => { load({ refresh: true }); }, [load]));

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    // Per-report tally: how many unique students have any result + how many
    // are still drafts. Drives the badges shown on each card.
    const tallies = useMemo(() => {
        const m = new Map();
        for (const r of results) {
            const rid = Number(r.report_id ?? r.report?.id);
            if (!rid) continue;
            const cid = Number(r.client_id ?? r.client?.id);
            if (!cid) continue;
            const entry = m.get(rid) || {
                students: new Set(),
                drafts: 0,
                completed: 0,
                last: null,
            };
            entry.students.add(cid);
            if (r.completed) entry.completed += 1;
            else entry.drafts += 1;
            const t = r.updated_at || r.created_at;
            if (t && (!entry.last || new Date(t) > new Date(entry.last))) entry.last = t;
            m.set(rid, entry);
        }
        return m;
    }, [results]);

    const reports = useMemo(() => {
        return (templates || []).map((tpl) => {
            const t = tallies.get(Number(tpl.id)) || { students: new Set(), drafts: 0, completed: 0, last: null };
            return {
                id: tpl.id,
                title: tpl.title,
                students_assessed: t.students.size,
                drafts: t.drafts,
                completed: t.completed,
                last: t.last,
            };
        });
    }, [templates, tallies]);

    const openReport = (reportId) => {
        router.push(`/class/${classId}/progress-reports/${reportId}`);
    };

    const renderReport = ({ item }) => (
        <Card
            activeOpacity={0.85}
            onPress={() => openReport(item.id)}
            style={styles.card}
        >
            <View style={[styles.iconWrap, { backgroundColor: iconColor('file-text-o', colors) + '22' }]}>
                <FontAwesome name="file-text-o" size={18} color={iconColor('file-text-o', colors)} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.title}
                </Text>
                <View style={styles.metaRow}>
                    {item.students_assessed ? (
                        <Text style={[styles.meta, { color: colors.textSecondary }]}>
                            {item.students_assessed} assessed
                        </Text>
                    ) : (
                        <Text style={[styles.meta, { color: colors.textSecondary, fontStyle: 'italic' }]}>
                            No assessments yet
                        </Text>
                    )}
                    {item.drafts ? (
                        <Chip text={`${item.drafts} draft`} bg={(colors.warning || colors.primary) + '22'} color={colors.warning || colors.primary} />
                    ) : null}
                    {item.completed ? (
                        <Chip text={`${item.completed} done`} bg={(colors.success || colors.primary) + '22'} color={colors.success || colors.primary} />
                    ) : null}
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Card>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => goBack()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        Reports
                    </Text>
                </View>
            </View>

            {isLoading && reports.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && reports.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={iconColor('alert-circle-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={reports}
                    keyExtractor={(it) => String(it.id)}
                    renderItem={renderReport}
                    contentContainerStyle={[
                        styles.list,
                        { paddingBottom: styles.list.paddingBottom + insets.bottom },
                    ]}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <FontAwesome name="file-text-o" size={32} color={iconColor('file-text-o', colors)} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                No progress reports linked to this class.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

function Chip({ text, bg, color }) {
    return (
        <View style={[styles.chip, { backgroundColor: bg }]}>
            <Text style={[styles.chipText, { color }]}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    iconButton: { padding: 8, borderRadius: 999 },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    list: { padding: 16, gap: cardGap, paddingBottom: 32 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
    },
    iconWrap: {
        width: 40, height: 40, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 15, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    meta: { fontSize: 12 },
    chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
    chipText: { fontSize: 10, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
