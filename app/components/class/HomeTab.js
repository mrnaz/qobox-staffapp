import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import NoticeCard from '../NoticeCard';
import { cardGap } from '../Card';
import { ensureAcademicPeriod } from '../../utils/academicPeriod';

// "Home" tab — class noticeboard. Renders the same NoticeCard the dashboard
// does, so a notice looks and expands identically wherever it appears.
export default function HomeTab({ classId }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [notices, setNotices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const [orgId, period] = await Promise.all([
                    AsyncStorage.getItem('organisationId'),
                    ensureAcademicPeriod().then((r) => r?.period).catch(() => null),
                ]);
                const res = await api.getClassNoticeboard(classId, {
                    organisation_id: orgId,
                    academic_period_id: period?.id,
                });
                const list = res?.noticeboard || res?.noticeboards || res?.data || [];
                setNotices(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Class notices load error', err);
                setError(err.body?.message || err.message || 'Failed to load notices.');
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

    if (isLoading && notices.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && notices.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="megaphone-outline" size={32} color={colors.textDisabled} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
            </View>
        );
    }

    return (
        <FlatList
            data={notices}
            keyExtractor={(it, i) => String(it.id ?? i)}
            renderItem={({ item }) => <NoticeCard notice={item} />}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="megaphone-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No class notices yet.</Text>
                    <Text style={[styles.emptySub, { color: colors.textDisabled }]}>
                        Announcements for this class will appear here.
                    </Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    list: { padding: 16, paddingBottom: 32, gap: cardGap },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptySub: { fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
});
