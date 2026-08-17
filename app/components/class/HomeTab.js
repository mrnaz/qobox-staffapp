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
import { iconColor } from '../../utils/iconColors';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Card, { CardHeader, cardBodyPadding } from '../Card';
import { ensureAcademicPeriod } from '../../utils/academicPeriod';

const stripHtml = (html = '') =>
    String(html)
        .replace(/<\/(p|div|li|br|h[1-6])>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n+/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// "Home" tab — class noticeboard. Mirrors the client app's HomeTab (class notices),
// rendered in the staff app's card style.
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

    const renderItem = ({ item }) => {
        const body = stripHtml(item.body || item.content || '');
        return (
            <Card>
                <CardHeader title={item.title || 'Untitled notice'} />
                <View style={styles.cardBody}>
                    {body ? (
                        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={6}>
                            {body}
                        </Text>
                    ) : null}
                    {(item.scheduled || item.created_at) ? (
                        <Text style={[styles.date, { color: colors.textDisabled }]}>
                            {fmtDate(item.scheduled || item.created_at)}
                        </Text>
                    ) : null}
                </View>
            </Card>
        );
    };

    if (isLoading && notices.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && notices.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="megaphone-outline" size={32} color={iconColor('megaphone-outline', colors)} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
            </View>
        );
    }

    return (
        <FlatList
            data={notices}
            keyExtractor={(it, i) => String(it.id ?? i)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="megaphone-outline" size={32} color={iconColor('megaphone-outline', colors)} />
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
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    cardBody: { ...cardBodyPadding, gap: 8 },
    body: { fontSize: 13, lineHeight: 19 },
    date: { fontSize: 11 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptySub: { fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
});
