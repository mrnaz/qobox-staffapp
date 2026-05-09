import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import TicketFormModal from '../components/TicketFormModal';
import {
    PRIORITY_META,
    STATUS_META,
    deriveStatus,
} from '../utils/tickets';

const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function TicketsScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [search, setSearch] = useState('');
    // 'submitted' = tickets I reported · 'assigned' = tickets assigned to me
    const [filter, setFilter] = useState('submitted');
    const [createOpen, setCreateOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            const json = await AsyncStorage.getItem('staff');
            try { setStaff(json ? JSON.parse(json) : null); } catch { setStaff(null); }
        })();
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                // Always fetch the full set the user has access to. Filtering
                // (submitted vs assigned) happens client-side against the
                // current staff id so both tabs are scoped to the logged-in user.
                const res = await api.getMaintenanceReports({
                    show_all: 'true',
                    search: search.trim() || undefined,
                    sortBy: 'reported',
                    orderBy: 'desc',
                    limit: 50,
                });
                const list = res?.data || res || [];
                setTickets(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Tickets load error', err);
                setError(err.body?.message || err.message || 'Failed to load tickets.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [search]
    );

    // Filtered list for the active tab.
    const visibleTickets = (() => {
        if (!staff?.id) return [];
        if (filter === 'submitted') {
            return tickets.filter((t) => t.reported_by?.id === staff.id);
        }
        // 'assigned'
        return tickets.filter((t) =>
            t.assigned_to_me === true ||
            (t.assigned_to && t.assigned_to.id === staff.id)
        );
    })();

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const renderItem = ({ item }) => {
        const p = PRIORITY_META[item.priority] || PRIORITY_META.N;
        const s = STATUS_META[deriveStatus(item)];
        const noteCount = Array.isArray(item.notes) ? item.notes.length : 0;
        return (
            <TouchableOpacity
                onPress={() => router.push(`/tickets/${item.id}`)}
                activeOpacity={0.8}
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
            >
                <View style={styles.cardHeader}>
                    <Ionicons name={p.icon} size={16} color={p.color(colors)} />
                    <Text style={[styles.ref, { color: colors.textSecondary }]}>#{item.report_ref}</Text>
                    <View style={[styles.statusPill, { backgroundColor: s.bg(colors), borderColor: s.fg(colors) }]}>
                        <Text style={[styles.statusText, { color: s.fg(colors) }]}>{s.label}</Text>
                    </View>
                </View>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.title || 'Untitled'}
                </Text>
                {item.location ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        <Ionicons name="location-outline" size={11} color={colors.textSecondary} /> {item.location}
                    </Text>
                ) : null}
                <View style={styles.metaRow}>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                        By {item.reported_by?.name || '—'} · {fmtDate(item.reported || item.created_at)}
                    </Text>
                    {noteCount > 0 ? (
                        <View style={styles.commentBadge}>
                            <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.textSecondary} />
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>{noteCount}</Text>
                        </View>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.toolbar}>
                <View style={[styles.searchBox, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Ionicons name="search" size={16} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        placeholder="Search tickets"
                        placeholderTextColor={colors.textSecondary}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="search"
                        onSubmitEditing={() => load()}
                    />
                    {search ? (
                        <TouchableOpacity onPress={() => { setSearch(''); }}>
                            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : null}
                </View>
                <View style={styles.filterRow}>
                    <TouchableOpacity
                        onPress={() => setFilter('submitted')}
                        style={[styles.tab, filter === 'submitted' && { borderColor: colors.primary }]}
                    >
                        <Text style={{
                            color: filter === 'submitted' ? colors.primary : colors.textSecondary,
                            fontWeight: filter === 'submitted' ? '600' : '400',
                        }}>
                            Submitted
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilter('assigned')}
                        style={[styles.tab, filter === 'assigned' && { borderColor: colors.primary }]}
                    >
                        <Text style={{
                            color: filter === 'assigned' ? colors.primary : colors.textSecondary,
                            fontWeight: filter === 'assigned' ? '600' : '400',
                        }}>
                            Assigned
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading && tickets.length === 0 ? (
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : error && tickets.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={visibleTickets}
                    keyExtractor={(it) => String(it.id)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="receipt-outline" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                {search
                                    ? 'No tickets match your search.'
                                    : filter === 'submitted'
                                        ? 'You haven\'t submitted any tickets yet. Tap + to create one.'
                                        : 'No tickets are assigned to you.'}
                            </Text>
                        </View>
                    }
                />
            )}

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.primary }]}
                onPress={() => setCreateOpen(true)}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>

            <TicketFormModal
                visible={createOpen}
                onClose={() => setCreateOpen(false)}
                onSaved={async () => { setCreateOpen(false); await load({ refresh: true }); }}
                staff={staff}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    toolbar: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },
    filterRow: { flexDirection: 'row', gap: 6 },
    tab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    list: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 10 },
    card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ref: { fontSize: 12, fontWeight: '700' },
    statusPill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    title: { fontSize: 15, fontWeight: '600' },
    subtitle: { fontSize: 12 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    meta: { fontSize: 11 },
    commentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
