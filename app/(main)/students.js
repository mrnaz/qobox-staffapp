import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import Card from '../components/Card';
import { ensureAcademicPeriod, setAcademicPeriod } from '../utils/academicPeriod';
import PeriodPicker from '../components/PeriodPicker';
import { iconColor } from '../utils/iconColors';

export default function MyStudentsScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [period, setPeriod] = useState(null);
    const [periods, setPeriods] = useState([]);
    const [classes, setClasses] = useState([]);
    const [search, setSearch] = useState('');
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
                    const { period: p, periods: list } = await ensureAcademicPeriod();
                    activePeriod = p;
                    setPeriod(p);
                    setPeriods(Array.isArray(list) ? list : []);
                }
                if (!activePeriod?.id) {
                    setClasses([]);
                    setError('We could not determine your academic period. Pull to refresh or contact your administrator.');
                    return;
                }
                const res = await api.getStaffClasses(staff.id, {
                    academic_period: activePeriod.id,
                });
                const list = res?.classes || res?.data || res || [];
                setClasses(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Students load error', err);
                setError(err.body?.message || err.message || 'Failed to load students.');
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

    const handlePeriodChange = (p) => {
        if (!p || p.id === period?.id) return;
        setAcademicPeriod(p.id);
        setPeriod(p);
    };

    // Aggregate unique students across all classes the user teaches. The
    // backend (ClassStaffController::get_staff_classes) returns each student
    // row with student_id / student_fname / student_sname / photo / list_photo,
    // so we read those exact field names here.
    const students = useMemo(() => {
        const map = new Map();
        for (const cls of classes) {
            const classTitle = cls.title || cls.class_title || 'Class';
            const arr = Array.isArray(cls.students) ? cls.students : [];
            for (const st of arr) {
                const id = st.student_id ?? st.id ?? st.client_id;
                if (id == null) continue;
                if (!map.has(id)) {
                    const name =
                        st.name ||
                        `${st.student_fname || st.fname || ''} ${st.student_sname || st.sname || ''}`.trim() ||
                        'Student';
                    map.set(id, {
                        id,
                        name,
                        photo: st.list_photo || st.photo || null,
                        classes: [classTitle],
                    });
                } else {
                    const entry = map.get(id);
                    if (!entry.classes.includes(classTitle)) entry.classes.push(classTitle);
                }
            }
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [classes]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return students;
        return students.filter((s) => s.name.toLowerCase().includes(q));
    }, [students, search]);

    if (profileLoaded && !staff?.id) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Ionicons name="person-outline" size={32} color={iconColor('person-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No profile loaded. Please sign in again.
                    </Text>
                </View>
            </View>
        );
    }

    const renderItem = ({ item }) => (
        <Card
            activeOpacity={0.85}
            onPress={() => router.push(`/student/${item.id}`)}
            style={styles.row}
        >
            <Avatar uri={item.photo} name={item.name} id={item.id} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.name}
                </Text>
                <View style={styles.metaRow}>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.classes.join(', ')}
                    </Text>
                </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Card>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {periods.length > 0 ? (
                <PeriodPicker
                    periods={periods}
                    selectedId={period?.id}
                    onChange={handlePeriodChange}
                />
            ) : null}

            {/* Search */}
            <View style={[styles.searchWrap, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}>
                <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search students…"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                />
                {search ? (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {isLoading && students.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && students.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={iconColor('alert-circle-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(it) => String(it.id)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="people-outline" size={32} color={iconColor('people-outline', colors)} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                {search
                                    ? 'No students match your search.'
                                    : period?.label
                                        ? `No students in ${period.label}.`
                                        : "You don't have any students yet."}
                            </Text>
                            {!search && periods.length > 1 ? (
                                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                                    Teaching in a different period? Tap the period above to switch.
                                </Text>
                            ) : null}
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginHorizontal: 16,
        marginTop: 12,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
    },
    title: { fontSize: 14, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    meta: { fontSize: 12, flexShrink: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptyHint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 40, marginTop: 2 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
