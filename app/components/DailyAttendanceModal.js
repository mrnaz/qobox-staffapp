import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Modal,
    FlatList,
    ActivityIndicator,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';

// Daily attendance marking modal — mobile counterpart of the staff web
// DailyAttendanceMarkingDialog.vue. The scope/course filter and per-student
// advanced editor (notes/arrived/departed) on the web are not ported yet;
// users can mark statuses, search, see counts, and submit.

const STATUS_META = {
    present: { label: 'Present',  color: '#11AA22', icon: 'checkbox' },
    absent:  { label: 'Absent',   color: '#BB2222', icon: 'close-circle' },
    late:    { label: 'Late',     color: '#EE9911', icon: 'time' },
    left:    { label: 'Left',     color: '#2196F3', icon: 'exit' },
    notset:  { label: 'Unmarked', color: '#8899CC', icon: 'square-outline' },
};

// Web cycle: notset → present → absent → late → left → notset
const NEXT_STATUS = {
    notset: 'present',
    present: 'absent',
    absent: 'late',
    late: 'left',
    left: 'notset',
};

const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
};

export default function DailyAttendanceModal({
    visible,
    date,
    academicPeriodId,
    siteId,
    attendanceId: initialAttendanceId, // may be null when no record exists yet
    canSubmit,
    onClose,
    onSaved,
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [students, setStudents] = useState([]);
    const [statusMap, setStatusMap] = useState({}); // clientId → 'present'|'absent'|...
    const [attendanceId, setAttendanceId] = useState(initialAttendanceId || null);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [staffId, setStaffId] = useState(null);
    const [abilities, setAbilities] = useState([]);
    const [filterStatus, setFilterStatus] = useState(null); // 'present'|'absent'|'late'|'left'|'notset'|null

    useEffect(() => {
        (async () => {
            const [staffJson, abilitiesJson] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('abilities'),
            ]);
            try { setStaffId(staffJson ? JSON.parse(staffJson)?.id : null); } catch { setStaffId(null); }
            try {
                const parsed = abilitiesJson ? JSON.parse(abilitiesJson) : [];
                setAbilities(Array.isArray(parsed) ? parsed : []);
            } catch { setAbilities([]); }
        })();
    }, []);

    // Mirror the web DailyAttendanceMarkingDialog: only staff who can manage
    // students see the Submit button. Sysadmins implicitly have all abilities.
    const canManageAttendance =
        abilities.includes('manage_students') || abilities.includes('sysadmin');

    useEffect(() => {
        setAttendanceId(initialAttendanceId || null);
    }, [initialAttendanceId]);

    const loadData = useCallback(async () => {
        if (!visible) return;
        setIsLoading(true);
        setError('');
        try {
            const studentsRes = await api.getClients({
                period_id: academicPeriodId,
                filter: 'active',
                all: true,
                limit: 200,
            });
            const studentList = studentsRes?.students || studentsRes?.data || [];
            setStudents(Array.isArray(studentList) ? studentList : []);

            const map = {};
            if (attendanceId) {
                try {
                    const res = await api.getDailyAttendanceClients(attendanceId);
                    (res?.clients || []).forEach((c) => {
                        if (c?.client_id && c?.status) map[String(c.client_id)] = c.status;
                    });
                } catch (innerErr) {
                    console.error('Daily attendance clients load error', innerErr);
                }
            }
            setStatusMap(map);
        } catch (err) {
            console.error('Daily attendance modal load error', err);
            setError(err.body?.message || err.message || 'Failed to load students.');
        } finally {
            setIsLoading(false);
        }
    }, [visible, academicPeriodId, attendanceId]);

    useEffect(() => {
        if (visible) loadData();
        if (!visible) {
            setSearch('');
            setFilterStatus(null);
        }
    }, [visible, loadData]);

    const ensureAttendance = async () => {
        if (attendanceId) return attendanceId;
        const res = await api.createDailyAttendance({
            date,
            period_id: academicPeriodId,
            staff_id: staffId,
            site_id: siteId,
        });
        const newId =
            res?.id ?? res?.attendanceId ?? res?.attendance_id ?? res?.original?.id ?? null;
        if (!newId) throw new Error('Could not create attendance record.');
        setAttendanceId(newId);
        return newId;
    };

    const handleToggle = async (student) => {
        const clientId = student.id || student.client_id;
        const cur = statusMap[String(clientId)] || 'notset';
        const next = NEXT_STATUS[cur] || 'present';
        const previous = { ...statusMap };
        setStatusMap((prev) => ({ ...prev, [String(clientId)]: next }));
        try {
            const aid = await ensureAttendance();
            const res = await api.toggleDailyAttendance({
                attendance_id: aid,
                client_id: clientId,
                staff_id: staffId,
                reporter_id: staffId,
                status: next,
            });
            const serverStatus = res?.status ?? next;
            setStatusMap((prev) => {
                const copy = { ...prev };
                if (serverStatus === null) delete copy[String(clientId)];
                else copy[String(clientId)] = serverStatus;
                return copy;
            });
        } catch (err) {
            console.error('Toggle attendance error', err);
            setStatusMap(previous);
            Alert.alert('Could not update', err.body?.message || err.message || 'Please try again.');
        }
    };

    const handleSubmit = async () => {
        if (!attendanceId) {
            Alert.alert('Nothing to submit', 'Mark at least one student first.');
            return;
        }
        try {
            setIsSubmitting(true);
            await api.submitDailyAttendance({
                attendance_id: attendanceId,
                reporter_id: staffId,
            });
            onSaved?.({ attendanceId, date });
            onClose?.();
        } catch (err) {
            console.error('Submit attendance error', err);
            Alert.alert('Submit failed', err.body?.message || err.message || 'Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const counts = useMemo(() => {
        const c = { present: 0, absent: 0, late: 0, left: 0, notset: 0 };
        const total = students.length;
        Object.values(statusMap).forEach((s) => {
            if (c[s] !== undefined) c[s] += 1;
        });
        c.notset = Math.max(0, total - (c.present + c.absent + c.late + c.left));
        return c;
    }, [statusMap, students.length]);

    const visibleStudents = useMemo(() => {
        const q = search.trim().toLowerCase();
        return students.filter((s) => {
            const name = `${s.fname || ''} ${s.sname || ''}`.toLowerCase();
            if (q && !name.includes(q)) return false;
            if (filterStatus) {
                const cur = statusMap[String(s.id || s.client_id)] || 'notset';
                if (cur !== filterStatus) return false;
            }
            return true;
        });
    }, [students, search, filterStatus, statusMap]);

    const renderItem = ({ item }) => {
        const clientId = item.id || item.client_id;
        const status = statusMap[String(clientId)] || 'notset';
        const meta = STATUS_META[status];
        return (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.fname} {item.sname}
                    </Text>
                    {item.class ? (
                        <Text style={[styles.subline, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.class}
                        </Text>
                    ) : null}
                </View>
                <TouchableOpacity
                    onPress={() => handleToggle(item)}
                    style={[styles.statusPill, { borderColor: meta.color, backgroundColor: meta.color + '22' }]}
                >
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                    <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>Daily attendance</Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {fmtDate(date)}
                        </Text>
                    </View>
                </View>

                {/* Summary — all 5 totals in one box, one line */}
                <View style={styles.summaryWrap}>
                    <View style={[styles.summaryBox, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                        {['present', 'absent', 'late', 'left', 'notset'].map((key) => {
                            const meta = STATUS_META[key];
                            const active = filterStatus === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    onPress={() => setFilterStatus(active ? null : key)}
                                    style={[styles.summaryItem, active && { backgroundColor: meta.color + '14' }]}
                                >
                                    <Ionicons name={meta.icon} size={14} color={meta.color} />
                                    <Text style={[styles.summaryCount, { color: colors.textPrimary }]}>
                                        {counts[key]}
                                    </Text>
                                    <Text
                                        style={[styles.summaryLabel, { color: colors.textSecondary }]}
                                        numberOfLines={1}
                                    >
                                        {meta.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Search */}
                <View style={styles.searchWrap}>
                    <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                        <Ionicons name="search" size={16} color={colors.textSecondary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.textPrimary }]}
                            placeholder="Search by student name"
                            placeholderTextColor={colors.textSecondary}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {search ? (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Student list */}
                {isLoading && students.length === 0 ? (
                    <View style={styles.center}>
                        <ActivityIndicator color={colors.primary} />
                    </View>
                ) : error ? (
                    <View style={styles.center}>
                        <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                        <TouchableOpacity onPress={loadData} style={[styles.retry, { borderColor: colors.primary }]}>
                            <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={visibleStudents}
                        keyExtractor={(it, i) => String(it.id || it.client_id || i)}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={
                            <View style={styles.center}>
                                <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
                                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                    {search || filterStatus ? 'No students match your filter.' : 'No students found.'}
                                </Text>
                            </View>
                        }
                    />
                )}

                {/* Footer */}
                <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                    {canSubmit && canManageAttendance ? (
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={isSubmitting || !attendanceId}
                            style={[styles.btn, {
                                backgroundColor: colors.primary,
                                opacity: (isSubmitting || !attendanceId) ? 0.5 : 1,
                                flex: 1,
                            }]}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.btnText}>Submit attendance</Text>
                            )}
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                        onPress={onClose}
                        disabled={isSubmitting}
                        style={[styles.btnOutline, { borderColor: colors.border, flex: (canSubmit && canManageAttendance) ? 0.5 : 1 }]}
                    >
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        gap: 4,
    },
    iconBtn: { padding: 8 },
    title: { fontSize: 16, fontWeight: '700' },
    subtitle: { fontSize: 12 },
    summaryWrap: {
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    summaryBox: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 2,
        borderRadius: 6,
        gap: 2,
    },
    summaryLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
    summaryCount: { fontSize: 16, fontWeight: '700' },
    searchWrap: { paddingHorizontal: 16, paddingVertical: 4 },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },
    list: { paddingHorizontal: 16, paddingVertical: 6, paddingBottom: 16 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { fontSize: 14, fontWeight: '600' },
    subline: { fontSize: 11 },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    statusLabel: { fontSize: 11, fontWeight: '700' },
    footer: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
    },
    btnText: { color: '#fff', fontWeight: '700' },
    btnOutline: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 60 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
