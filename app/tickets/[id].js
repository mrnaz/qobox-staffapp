import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import {
    PRIORITY_META,
    STATUS_META,
    deriveStatus,
} from '../utils/tickets';

const fmtDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleString(undefined, {
              day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
          });
};

export default function TicketDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id } = useLocalSearchParams();
    const router = useRouter();

    const [ticket, setTicket] = useState(null);
    const [staff, setStaff] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [commentText, setCommentText] = useState('');
    const [posting, setPosting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            setError('');
            const [res, s] = await Promise.all([
                api.getMaintenanceReport(id),
                AsyncStorage.getItem('staff'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            const data = res?.data || res?.maintenanceReport || res;
            setTicket(data);
        } catch (err) {
            console.error('Ticket load error', err);
            setError(err.body?.message || err.message || 'Failed to load ticket.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const submitComment = async () => {
        const text = commentText.trim();
        if (!text || !staff?.id) return;
        try {
            setPosting(true);
            await api.addMaintenanceReportNote(id, {
                note: text,
                staff_id: staff.id,
                created_by: staff.id,
                ready: true,
            });
            setCommentText('');
            // Re-fetch the ticket to get the new comment in the thread
            await load();
        } catch (err) {
            console.error('Add comment error', err);
            Alert.alert('Could not post comment', err.body?.message || err.message || 'Please try again.');
        } finally {
            setPosting(false);
        }
    };

    // Backend has no `status` column — toggle the `resolved` field instead.
    // Sending `{resolved: true}` sets it to now; `{resolved: null}` clears it.
    const toggleResolved = async () => {
        const isResolved = !!ticket?.resolved;
        try {
            setBusy(true);
            await api.updateMaintenanceReport(id, { resolved: isResolved ? null : true });
            // Re-fetch to get back-derived fields (resolved_by, status, etc.)
            await load();
        } catch (err) {
            console.error('Resolved toggle error', err);
            Alert.alert(
                isResolved ? 'Could not reopen ticket' : 'Could not mark resolved',
                err.body?.message || err.message || 'Please try again.'
            );
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = () => setConfirmDeleteOpen(true);

    const performDelete = async () => {
        try {
            setDeleting(true);
            await api.deleteMaintenanceReport(id);
            setConfirmDeleteOpen(false);
            router.back();
        } catch (err) {
            console.error('Delete ticket error', err);
            setConfirmDeleteOpen(false);
            Alert.alert('Could not delete', err.body?.message || err.message || 'Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            </SafeAreaView>
        );
    }

    if (error || !ticket) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, paddingHorizontal: 24, textAlign: 'center' }}>
                        {error || 'Ticket not found.'}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const p = PRIORITY_META[ticket.priority] || PRIORITY_META.N;
    const status = deriveStatus(ticket);
    const s = STATUS_META[status];
    const notes = Array.isArray(ticket.notes) ? ticket.notes : [];
    const isResolved = !!ticket.resolved;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                        Ticket #{ticket.report_ref}
                    </Text>
                    <TouchableOpacity onPress={handleDelete} disabled={busy} style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={20} color={colors.error || colors.warning} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.body}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                        <View style={styles.titleRow}>
                            <Ionicons name={p.icon} size={18} color={p.color(colors)} />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>
                                {ticket.title || 'Untitled'}
                            </Text>
                        </View>

                        <View style={[styles.statusPill, { backgroundColor: s.bg(colors), borderColor: s.fg(colors) }]}>
                            <Text style={[styles.statusText, { color: s.fg(colors) }]}>{s.label}</Text>
                        </View>

                        <View style={styles.metaGrid}>
                            <Meta label="Priority" colors={colors}>
                                <Text style={[styles.metaValue, { color: p.color(colors) }]}>{p.label}</Text>
                            </Meta>
                            {ticket.category && !Array.isArray(ticket.category) ? (
                                <Meta label="Category" colors={colors}>
                                    <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                                        {ticket.category.label || ticket.category.name}
                                    </Text>
                                </Meta>
                            ) : null}
                            {ticket.location ? (
                                <Meta label="Location" colors={colors}>
                                    <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{ticket.location}</Text>
                                </Meta>
                            ) : null}
                            <Meta label="Reported by" colors={colors}>
                                <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                                    {ticket.reported_by?.name || '—'}
                                </Text>
                            </Meta>
                            <Meta label="Reported" colors={colors}>
                                <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                                    {fmtDateTime(ticket.reported || ticket.created_at)}
                                </Text>
                            </Meta>
                            {ticket.assigned_to ? (
                                <Meta label="Assigned to" colors={colors}>
                                    <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                                        {ticket.assigned_to.name}
                                    </Text>
                                </Meta>
                            ) : null}
                            {ticket.due_date ? (
                                <Meta label="Due" colors={colors}>
                                    <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                                        {fmtDateTime(ticket.due_date)}
                                    </Text>
                                </Meta>
                            ) : null}
                        </View>

                        {ticket.description ? (
                            <View style={[styles.descBlock, { borderTopColor: colors.border }]}>
                                <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Description</Text>
                                <Text style={[styles.descText, { color: colors.textPrimary }]}>
                                    {ticket.description}
                                </Text>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            onPress={toggleResolved}
                            disabled={busy}
                            style={[
                                styles.resolveBtn,
                                {
                                    backgroundColor: isResolved
                                        ? 'transparent'
                                        : (colors.success || colors.primary),
                                    borderColor: colors.success || colors.primary,
                                    opacity: busy ? 0.6 : 1,
                                },
                            ]}
                        >
                            {busy ? (
                                <ActivityIndicator color={isResolved ? (colors.success || colors.primary) : '#fff'} />
                            ) : (
                                <>
                                    <Ionicons
                                        name={isResolved ? 'refresh-outline' : 'checkmark-circle-outline'}
                                        size={16}
                                        color={isResolved ? (colors.success || colors.primary) : '#fff'}
                                    />
                                    <Text style={[
                                        styles.resolveBtnText,
                                        { color: isResolved ? (colors.success || colors.primary) : '#fff' },
                                    ]}>
                                        {isResolved ? 'Reopen ticket' : 'Mark resolved'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                        Comments ({notes.length})
                    </Text>
                    {notes.length === 0 ? (
                        <View style={[styles.emptyComments, { borderColor: colors.border }]}>
                            <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>No comments yet.</Text>
                        </View>
                    ) : (
                        notes.map((c) => {
                            const mine = c.staff?.id === staff?.id;
                            return (
                                <View
                                    key={c.id}
                                    style={[styles.comment, {
                                        borderColor: colors.border,
                                        backgroundColor: mine ? colors.primary + '11' : colors.cardBackground,
                                        alignSelf: mine ? 'flex-end' : 'flex-start',
                                    }]}
                                >
                                    <Text style={[styles.commentAuthor, { color: mine ? colors.primary : colors.textSecondary }]}>
                                        {mine ? 'You' : (c.staff?.name || 'Unknown')}
                                        {' · '}
                                        {fmtDateTime(c.created_at || c.submitted_at)}
                                    </Text>
                                    <Text style={[styles.commentText, { color: colors.textPrimary }]}>
                                        {c.note}
                                    </Text>
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                    <TextInput
                        style={[styles.composerInput, {
                            color: colors.textPrimary,
                            backgroundColor: colors.cardBackground,
                            borderColor: colors.border,
                        }]}
                        placeholder="Write a comment…"
                        placeholderTextColor={colors.textSecondary}
                        value={commentText}
                        onChangeText={setCommentText}
                        multiline
                    />
                    <TouchableOpacity
                        onPress={submitComment}
                        disabled={posting || !commentText.trim()}
                        style={[styles.sendBtn, {
                            backgroundColor: colors.primary,
                            opacity: posting || !commentText.trim() ? 0.5 : 1,
                        }]}
                    >
                        {posting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Ionicons name="send" size={18} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            <ConfirmDialog
                visible={confirmDeleteOpen}
                title="Delete ticket?"
                message="This will permanently remove the ticket and all its comments. This action cannot be undone."
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onCancel={() => setConfirmDeleteOpen(false)}
                onConfirm={performDelete}
            />
        </SafeAreaView>
    );
}

function Meta({ label, children, colors }) {
    return (
        <View style={{ minWidth: '45%', flexBasis: '45%', flexGrow: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {label}
            </Text>
            <View style={{ marginTop: 2 }}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
    },
    iconBtn: { padding: 8, minWidth: 40, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
    body: { padding: 16, gap: 14, paddingBottom: 24 },
    card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 18, fontWeight: '700', flex: 1 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        alignSelf: 'flex-start',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
    },
    statusText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 10 },
    metaValue: { fontSize: 13, fontWeight: '600' },
    descBlock: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
    descLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    descText: { fontSize: 14, lineHeight: 20 },
    sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
    emptyComments: {
        borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
        padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    comment: {
        borderWidth: 1, borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: 10,
        maxWidth: '90%',
        gap: 4,
    },
    commentAuthor: { fontSize: 11, fontWeight: '600' },
    commentText: { fontSize: 14, lineHeight: 20 },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    composerInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxHeight: 120,
        fontSize: 14,
    },
    sendBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
    },
    resolveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 4,
    },
    resolveBtnText: { fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
