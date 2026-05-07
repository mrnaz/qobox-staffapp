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
import { useRouter } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { ensureAcademicPeriod } from '../utils/academicPeriod';

export default function ClassesScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [period, setPeriod] = useState(null);
    const [classes, setClasses] = useState([]);
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
                const res = await api.getStaffClasses(staff.id, {
                    // Backend `staff/classes/{staff_id}` controller uses
                    // $request->query('academic_period'), not period_id.
                    academic_period: activePeriod?.id,
                });
                const list = res?.classes || res?.data || res || [];
                setClasses(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Classes load error', err);
                setError(err.body?.message || err.message || 'Failed to load classes.');
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

    const renderItem = ({ item }) => {
        // Backend response item shape: { id, title, description, course_title,
        //   students: [], scheduled_lessons, scheduled_lessons_passed,
        //   completed_lessons, planned_lessons, course_id, ... }
        const id = item.id ?? item.class_id;
        const studentCount = Array.isArray(item.students)
            ? item.students.length
            : (item.student_count ?? item.students_count ?? null);
        return (
            <TouchableOpacity
                onPress={() => router.push(`/class/${id}`)}
                activeOpacity={0.8}
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
            >
                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                        {item.title || item.class_title || 'Class'}
                    </Text>
                    {item.course_title ? (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                            {Array.isArray(item.course_title) ? item.course_title.join(', ') : item.course_title}
                        </Text>
                    ) : null}
                    <View style={styles.metaRow}>
                        {studentCount !== null ? (
                            <View style={styles.metaItem}>
                                <FontAwesome name="users" size={11} color={colors.textSecondary} />
                                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                                    {studentCount} student{studentCount === 1 ? '' : 's'}
                                </Text>
                            </View>
                        ) : null}
                        {item.scheduled_lessons ? (
                            <View style={styles.metaItem}>
                                <FontAwesome name="book" size={11} color={colors.textSecondary} />
                                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {item.completed_lessons ?? 0}/{item.scheduled_lessons} lessons
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {isLoading && classes.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && classes.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={classes}
                    keyExtractor={(it, i) => String(it.id ?? it.class_id ?? i)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="school-outline" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>You aren't assigned to any classes.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
    },
    title: { fontSize: 15, fontWeight: '700' },
    subtitle: { fontSize: 12 },
    metaRow: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    meta: { fontSize: 11 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
