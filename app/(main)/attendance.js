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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { ensureAcademicPeriod } from '../utils/academicPeriod';
import DailyAttendanceModal from '../components/DailyAttendanceModal';

const fmtDate = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_LABELS = {
    open: 'Open',
    in_progress: 'In progress',
    submitted: 'Submitted',
    completed: 'Completed',
    closed: 'Closed',
    pending: 'Pending',
};

export default function AttendanceScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [siteId, setSiteId] = useState(null);
    const [period, setPeriod] = useState(null);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [openDay, setOpenDay] = useState(null); // { date, attendanceId, status }

    useEffect(() => {
        (async () => {
            const s = await AsyncStorage.getItem('siteId');
            setSiteId(s);
        })();
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                let activePeriod = period;
                if (!activePeriod) {
                    const { period: p } = await ensureAcademicPeriod();
                    activePeriod = p;
                    setPeriod(p);
                }
                const res = await api.getDailyAttendance({
                    site_id: siteId,
                    period_id: activePeriod?.id,
                });
                // Backend response: { data: [{ academic_date, present, absent,
                //   late, left, notset, status, attendance, ... }] }
                const list = res?.data || res?.daily_attendances || res || [];
                // Sort newest first
                const sorted = Array.isArray(list)
                    ? [...list].sort((a, b) =>
                        new Date(b.academic_date || b.date) - new Date(a.academic_date || a.date)
                      )
                    : [];
                setItems(sorted);
            } catch (err) {
                console.error('Attendance load error', err);
                setError(err.body?.message || err.message || 'Failed to load attendance.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [siteId, period]
    );

    useEffect(() => {
        if (siteId) load();
    }, [siteId, load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const renderItem = ({ item }) => {
        const present = item.present || 0;
        const absent = item.absent || 0;
        const late = item.late || 0;
        const left = item.left || 0;
        const total = present + absent + late + left + (item.notset || 0);
        const isCompleted = item.status === 'completed' || item.status === 'closed' || item.completed_at;
        const status = STATUS_LABELS[item.status] || (isCompleted ? 'Submitted' : 'Open');
        const statusColor = isCompleted
            ? colors.success || colors.primary
            : colors.warning || colors.primary;

        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setOpenDay({
                    date: item.academic_date || item.date,
                    attendanceId: item.id || item.attendance_id || null,
                    status: item.status,
                })}
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
            >
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.date, { color: colors.textPrimary }]}>
                            {fmtDate(item.academic_date || item.date)}
                        </Text>
                        {item.dotw ? (
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                {String(item.dotw).trim()}
                                {item.session_count != null ? ` · ${item.session_count} session${item.session_count === 1 ? '' : 's'}` : ''}
                            </Text>
                        ) : null}
                    </View>
                    <View style={[styles.pill, { borderColor: statusColor, backgroundColor: statusColor + '22' }]}>
                        <Text style={[styles.pillText, { color: statusColor }]}>{status}</Text>
                    </View>
                </View>
                {item.attendance ? (
                    <Text style={[styles.attendancePct, { color: colors.primary }]}>
                        {item.attendance} attendance
                    </Text>
                ) : null}
                <View style={styles.statsRow}>
                    <Stat label="Present" value={present} color={colors.success || colors.primary} colors={colors} />
                    <Stat label="Absent" value={absent} color={colors.error || colors.warning} colors={colors} />
                    <Stat label="Late" value={late} color={colors.warning || colors.primary} colors={colors} />
                    <Stat label="Total" value={total} color={colors.textPrimary} colors={colors} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {isLoading && items.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && items.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(it, i) => String(it.id ?? `${it.academic_date || it.date || ''}-${i}`)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="checkbox-outline" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>No attendance records yet.</Text>
                        </View>
                    }
                />
            )}

            <DailyAttendanceModal
                visible={Boolean(openDay)}
                date={openDay?.date}
                academicPeriodId={period?.id}
                siteId={siteId}
                attendanceId={openDay?.attendanceId}
                canSubmit={openDay?.status !== 'completed' && openDay?.status !== 'closed'}
                onClose={() => setOpenDay(null)}
                onSaved={() => {
                    setOpenDay(null);
                    load({ refresh: true });
                }}
            />
        </View>
    );
}

function Stat({ label, value, color, colors }) {
    return (
        <View style={styles.statBox}>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    list: { padding: 16, paddingTop: 4, paddingBottom: 32, gap: 10 },
    card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    date: { fontSize: 14, fontWeight: '700', flex: 1 },
    pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    pillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    subtitle: { fontSize: 12, marginTop: 2 },
    attendancePct: { fontSize: 12, fontWeight: '700' },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 6 },
    statValue: { fontSize: 18, fontWeight: '700' },
    statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
