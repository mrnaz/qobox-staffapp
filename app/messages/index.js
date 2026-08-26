import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useGoBack } from '../utils/nav';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import Card, { cardGap } from '../components/Card';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ComposeModal from '../components/messages/ComposeModal';
import { stripHtml, fmtMessageDate, recipientsSummary, persistUnreadCount } from '../utils/messages';

const FOLDERS = [
    { key: 'inbox', label: 'Inbox' },
    { key: 'sent', label: 'Sent' },
    { key: 'draft', label: 'Drafts' },
];
const PAGE_SIZE = 20;

// Messages home: folder pills (Inbox / Sent / Drafts), search, infinite-scroll
// list, long-press multi-select delete, FAB compose. Inbox rows come from
// message-recipients (per-recipient read state + recipient row id for delete);
// sent/draft rows from messages?type=… .
export default function MessagesScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const goBack = useGoBack('/(main)/');

    const [staff, setStaff] = useState(null);
    const [folder, setFolder] = useState('inbox');
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [search, setSearch] = useState(''); // debounced value actually sent
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState('');

    const [selected, setSelected] = useState(null); // Set of row keys, null = not selecting
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [composeVisible, setComposeVisible] = useState(false);
    const [composeInitial, setComposeInitial] = useState(null);
    const [toast, setToast] = useState(null);

    const loadSeq = useRef(0);

    useEffect(() => {
        (async () => {
            const json = await AsyncStorage.getItem('staff');
            try { setStaff(json ? JSON.parse(json) : null); } catch { setStaff(null); }
        })();
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setSearch(searchQuery.trim()), 400);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Normalize both folder shapes into { key, recipientId?, msgRead, message }.
    const normalize = useCallback((data, whichFolder) => {
        const list = Array.isArray(data) ? data : [];
        if (whichFolder === 'inbox') {
            return list
                .filter((r) => r?.message)
                .map((r) => ({
                    key: `r-${r.id}`,
                    recipientId: r.id,
                    msgRead: !!r.msg_read,
                    message: r.message,
                }));
        }
        return list.map((m) => ({ key: `m-${m.id}`, msgRead: true, message: m.message || m }));
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            if (!staff?.id) return;
            const seq = ++loadSeq.current;
            const nextPage = opts.page || 1;
            try {
                if (opts.more) setIsLoadingMore(true);
                else if (!opts.refresh) setIsLoading(true);
                setError('');

                const params = { limit: PAGE_SIZE, page: nextPage };
                if (search) params.search = search;
                let res;
                if (folder === 'inbox') {
                    res = await api.getMessageRecipients({ ...params, staff_id: staff.id });
                } else {
                    res = await api.getMessages({ ...params, type: folder });
                }
                if (seq !== loadSeq.current) return; // stale response

                const fresh = normalize(res?.data, folder);
                setRows((prev) => (nextPage > 1 ? [...prev, ...fresh] : fresh));
                setPage(nextPage);

                const pg = res?.meta?.pagination;
                setHasMore(pg ? pg.current_page < pg.total_pages : !!res?.meta?.has_more);

                if (folder === 'inbox' && typeof res?.meta?.has_unread === 'number') {
                    setUnreadCount(res.meta.has_unread);
                    persistUnreadCount(res.meta.has_unread);
                }
            } catch (err) {
                if (seq !== loadSeq.current) return;
                console.error('Messages load error', err);
                setError(err.body?.message || err.message || 'Failed to load messages.');
            } finally {
                if (seq === loadSeq.current) {
                    setIsLoading(false);
                    setIsRefreshing(false);
                    setIsLoadingMore(false);
                }
            }
        },
        [staff, folder, search, normalize]
    );

    // Reload on folder/search change and whenever the screen regains focus
    // (keeps read-state fresh after the reader marks a message read).
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const switchFolder = (key) => {
        if (key === folder) return;
        setSelected(null);
        setRows([]);
        setFolder(key);
    };

    const openRow = (row) => {
        if (selected) {
            toggleSelect(row.key);
            return;
        }
        if (folder === 'draft') {
            setComposeInitial({
                draftId: row.message.id,
                subject: row.message.message_subject || '',
                body: stripHtml(row.message.message_body),
                // Seed the existing recipients: saving a draft rewrites its
                // recipient rows from this payload, so opening with an empty
                // list would wipe them server-side.
                recipients: (row.message.recipients || []).map((r) => ({
                    key: r.staff_id ? `staff-${r.staff_id}` : `client-${r.client_id}`,
                    result_type: r.staff_id ? 'staff' : 'client',
                    result_id: r.staff_id || r.client_id,
                    full_name: r.full_name || 'Recipient',
                    photo: r.photo || null,
                })),
            });
            setComposeVisible(true);
            return;
        }
        router.push(`/messages/${row.message.id}`);
    };

    const toggleSelect = (key) => {
        setSelected((prev) => {
            const next = new Set(prev || []);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next.size === 0 ? null : next;
        });
    };

    const deleteSelected = async () => {
        const keys = Array.from(selected || []);
        if (keys.length === 0) return;
        try {
            setDeleting(true);
            const chosen = rows.filter((r) => keys.includes(r.key));
            if (folder === 'inbox') {
                await api.deleteMessageRecipients(chosen.map((r) => r.recipientId));
            } else {
                for (const r of chosen) {
                    await api.deleteMessage(r.message.id);
                }
            }
            setToast({ message: `Deleted ${chosen.length} message${chosen.length === 1 ? '' : 's'}`, variant: 'success' });
            setSelected(null);
            load();
        } catch (err) {
            console.error('Delete messages error', err);
            setToast({ message: err.body?.message || err.message || 'Delete failed.', variant: 'error' });
        } finally {
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const renderRow = ({ item }) => {
        const m = item.message;
        const isUnread = folder === 'inbox' && !item.msgRead;
        const isSelected = selected?.has(item.key);
        const title = folder === 'inbox' ? (m.sender_full_name || 'Unknown sender') : `To: ${recipientsSummary(m)}`;
        const avatarName = folder === 'inbox' ? (m.sender_full_name || '?') : (m.recipients?.[0]?.full_name || '?');
        const avatarUri = folder === 'inbox' ? m.photo : m.recipients?.[0]?.photo;
        const avatarId = folder === 'inbox'
            ? (m.sender_staff_id || m.sender_client_id)
            : (m.recipients?.[0]?.staff_id || m.recipients?.[0]?.client_id);
        const dateLabel = folder === 'draft' ? 'Draft' : fmtMessageDate(m.msg_sent);

        return (
            <Card
                onPress={() => openRow(item)}
                onLongPress={() => toggleSelect(item.key)}
                style={[
                    styles.row,
                    isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
                ]}
            >
                {selected ? (
                    <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? colors.primary : colors.textSecondary}
                    />
                ) : (
                    <Avatar uri={avatarUri} name={avatarName} id={avatarId} size={40} />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.rowTop}>
                        <Text
                            style={[styles.rowTitle, { color: colors.textPrimary }, isUnread && styles.bold]}
                            numberOfLines={1}
                        >
                            {title}
                        </Text>
                        <Text style={[styles.rowDate, { color: isUnread ? colors.primary : colors.textSecondary }]}>
                            {dateLabel}
                        </Text>
                    </View>
                    <Text
                        style={[styles.rowSubject, { color: colors.textPrimary }, isUnread && styles.bold]}
                        numberOfLines={1}
                    >
                        {m.message_subject || '(no subject)'}
                    </Text>
                    <View style={styles.rowTop}>
                        <Text style={[styles.rowPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                            {stripHtml(m.message_body) || ' '}
                        </Text>
                        {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
                        {(m.attachments?.length || 0) > 0 ? (
                            <Ionicons name="attach" size={14} color={colors.textSecondary} />
                        ) : null}
                    </View>
                </View>
            </Card>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => goBack()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Messages</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Folder pills */}
            <View style={styles.folderRow}>
                {FOLDERS.map((f) => {
                    const active = folder === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            onPress={() => switchFolder(f.key)}
                            style={[
                                styles.folderPill,
                                { borderColor: active ? colors.primary : colors.border },
                                active && { backgroundColor: colors.primary + '18' },
                            ]}
                        >
                            <Text style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                                {f.label}
                            </Text>
                            {f.key === 'inbox' && unreadCount > 0 ? (
                                <View style={[styles.countPill, { backgroundColor: colors.error }]}>
                                    <Text style={[styles.countPillText, { color: colors.onPrimary }]}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                                </View>
                            ) : null}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Search */}
            <View style={[styles.searchBox, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}>
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search messages…"
                    placeholderTextColor={colors.textSecondary}
                    returnKeyType="search"
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                />
                {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {isLoading && rows.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && rows.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(it) => it.key}
                    renderItem={renderRow}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    onEndReached={() => {
                        if (hasMore && !isLoadingMore && !isLoading) load({ more: true, page: page + 1 });
                    }}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={
                        isLoadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="mail-open-outline" size={32} color={colors.textDisabled} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                {search
                                    ? 'No messages match your search.'
                                    : folder === 'inbox'
                                        ? 'Your inbox is empty.'
                                        : folder === 'sent'
                                            ? 'No sent messages yet.'
                                            : 'No drafts.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Multi-select action bar */}
            {selected ? (
                <View style={[styles.selectBar, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setSelected(null)} style={styles.iconButton}>
                        <Ionicons name="close" size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', flex: 1 }}>
                        {selected.size} selected
                    </Text>
                    <TouchableOpacity
                        onPress={() => setConfirmDelete(true)}
                        style={[styles.deleteBtn, { backgroundColor: colors.error + '22' }]}
                    >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                        <Text style={{ color: colors.error, fontWeight: '700', fontSize: 13 }}>Delete</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity
                    onPress={() => { setComposeInitial(null); setComposeVisible(true); }}
                    activeOpacity={0.85}
                    style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.cardShadow }]}
                >
                    <Ionicons name="create-outline" size={26} color={colors.onPrimary} />
                </TouchableOpacity>
            )}

            <ConfirmDialog
                visible={confirmDelete}
                title="Delete messages"
                message={`Delete ${selected?.size || 0} message${(selected?.size || 0) === 1 ? '' : 's'}? This cannot be undone here.`}
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onConfirm={deleteSelected}
                onCancel={() => setConfirmDelete(false)}
            />

            <ComposeModal
                visible={composeVisible}
                staff={staff}
                initial={composeInitial}
                onClose={() => { setComposeVisible(false); setComposeInitial(null); }}
                onDone={(what) => {
                    setComposeVisible(false);
                    setComposeInitial(null);
                    setToast({ message: what === 'draft' ? 'Draft saved' : 'Message sent', variant: 'success' });
                    load();
                }}
            />

            <Toast toast={toast} onHide={() => setToast(null)} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
    },
    iconButton: { padding: 8, borderRadius: 999 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    folderRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
    folderPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
    },
    countPill: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    countPillText: { fontSize: 10, fontWeight: '800' },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        marginHorizontal: 16,
        marginTop: 10,
        marginBottom: 4,
    },
    searchInput: { flex: 1, paddingVertical: 8, fontSize: 14 },
    list: { padding: 16, paddingBottom: 96, gap: cardGap },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowTitle: { flex: 1, fontSize: 13, fontWeight: '500' },
    rowSubject: { fontSize: 14, fontWeight: '500' },
    rowPreview: { flex: 1, fontSize: 12 },
    rowDate: { fontSize: 11 },
    bold: { fontWeight: '800' },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    selectBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
});
