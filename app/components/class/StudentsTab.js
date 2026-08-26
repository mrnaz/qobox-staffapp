import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Avatar from '../Avatar';
import { avatarName } from '../../utils/displayName';
import Card, { CardHeader, cardGap } from '../Card';

const fullName = (s) =>
    (s.fname || s.sname)
        ? `${s.fname || ''} ${s.sname || ''}`.trim()
        : (s.name || s.full_name || 'Unknown student');

// "Students" tab — class roster. Laid out exactly like the main Students page:
// one card headed "Students" with a count, and a divided row per student.
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

    const renderRow = (item, index) => {
        const id = item.id ?? item.client_id;
        const name = fullName(item);
        return (
            <TouchableOpacity
                key={String(id ?? index)}
                activeOpacity={0.85}
                disabled={id == null}
                onPress={() => { if (id != null) router.push(`/student/${id}`); }}
                style={[
                    styles.row,
                    // The header band closes the top, so only rows after the
                    // first draw a divider.
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
            >
                <Avatar uri={item.list_photo || item.photo || null} name={avatarName(item) || name} id={id} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                        {name}
                    </Text>
                </View>
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
                <Ionicons name="people-outline" size={32} color={colors.textDisabled} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            {students.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="people-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No students in this class.</Text>
                </View>
            ) : (
                <Card>
                    <CardHeader title="Students" meta={students.length} />
                    {students.map(renderRow)}
                </Card>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    list: { flexGrow: 1, padding: 16, paddingBottom: 32, gap: cardGap },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    title: { fontSize: 14, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
