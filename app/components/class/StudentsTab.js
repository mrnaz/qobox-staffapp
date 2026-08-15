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
import Avatar from '../Avatar';

const fullName = (s) =>
    (s.fname || s.sname)
        ? `${s.fname || ''} ${s.sname || ''}`.trim()
        : (s.name || s.full_name || 'Unknown student');

// "Students" tab — class roster. Mirrors the client app's StudentsTab, using the
// staff Avatar component (real photo with initials fallback). Tapping a student
// opens their profile, consistent with the rest of the staff app.
export default function StudentsTab({ classId }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [students, setStudents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                // all=true → `students` is a plain array (and not capped at the
                // default 50-per-page). Without it the backend wraps the list in
                // a paginator ({students: {data, meta}}), which is also handled
                // below in case the param is ever dropped.
                const res = await api.getClassStudents(classId, { all: 'true' });
                const list = Array.isArray(res?.students)
                    ? res.students
                    : res?.students?.data || res?.data || [];
                setStudents(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Class students load error', err);
                setError(err.body?.message || err.message || 'Failed to load students.');
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

    const renderItem = ({ item }) => {
        const id = item.id ?? item.client_id;
        const name = fullName(item);
        return (
            <TouchableOpacity
                onPress={() => { if (id != null) router.push(`/student/${id}`); }}
                disabled={id == null}
                activeOpacity={0.8}
                style={[styles.row, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
            >
                <Avatar uri={item.list_photo || item.photo || null} name={name} size={40} />
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {name}
                </Text>
                {id != null ? (
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                ) : null}
            </TouchableOpacity>
        );
    };

    if (isLoading && students.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && students.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <FlatList
            data={students}
            keyExtractor={(it, i) => String(it.id ?? it.client_id ?? i)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListHeaderComponent={
                students.length > 0 ? (
                    <Text style={[styles.count, { color: colors.textSecondary }]}>
                        {students.length} student{students.length === 1 ? '' : 's'}
                    </Text>
                ) : null
            }
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No students in this class.</Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    count: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
    },
    name: { flex: 1, fontSize: 14, fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
