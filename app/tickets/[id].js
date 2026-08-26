import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Image,
    Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoBack } from '../utils/nav';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import TicketFormModal from '../components/TicketFormModal';
import Card, { CardHeader, cardBodyPadding, cardGap } from '../components/Card';
import {
    PRIORITY_META,
    STATUS_META,
    deriveStatus,
} from '../utils/tickets';
import { parseApiDate } from '../utils/datetime';
import { capturePhotoCompressed, pickPhotoCompressed, appendPhotoToForm } from '../utils/photo';

// Postgres hands these back as "2026-08-15 11:14:39.172909+02" — a space
// separator, microseconds and a colon-less offset, all three of which Hermes
// rejects outright. parseApiDate normalizes them; `new Date()` on its own
// returned Invalid Date here, which is why comments showed no timestamp.
const fmtDateTime = (iso) => {
    const d = parseApiDate(iso);
    return d
        ? d.toLocaleString(undefined, {
              day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
          })
        : '';
};

// Newest first. Notes come back in insertion order, and a ticket thread reads
// better with the latest reply at the top — you open a ticket to see what just
// happened, not to re-read the first comment.
const sortNewestFirst = (notes) =>
    [...notes].sort((a, b) => {
        const ta = parseApiDate(a.created_at || a.submitted_at)?.getTime() ?? 0;
        const tb = parseApiDate(b.created_at || b.submitted_at)?.getTime() ?? 0;
        if (tb !== ta) return tb - ta;
        // Same timestamp (or both missing): fall back to id, which still grows
        // monotonically, so the ordering never flickers between renders.
        return (b.id ?? 0) - (a.id ?? 0);
    });

export default function TicketDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const goBack = useGoBack('/(main)/tickets');

    const [ticket, setTicket] = useState(null);
    const [staff, setStaff] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [commentText, setCommentText] = useState('');
    const [commentPhotos, setCommentPhotos] = useState([]); // [{ uri, width, height, mimeType }]
    const [viewerPhoto, setViewerPhoto] = useState(null);
    const [posting, setPosting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

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

    const addCommentPhoto = async (take) => {
        try {
            const photo = take ? await capturePhotoCompressed() : await pickPhotoCompressed();
            if (photo) setCommentPhotos((prev) => [...prev, photo]);
        } catch (err) {
            console.error(take ? 'Camera error' : 'Image picker error', err);
            Alert.alert(
                take ? 'Camera' : 'Photo library',
                err.message || 'Could not attach the photo.'
            );
        }
    };

    const removeCommentPhoto = (i) => {
        setCommentPhotos((prev) => prev.filter((_, idx) => idx !== i));
    };

    const submitComment = async () => {
        const text = commentText.trim();
        // A photo on its own is a valid comment — staff often just want to show
        // the thing rather than describe it.
        if ((!text && commentPhotos.length === 0) || !staff?.id) return;
        const photos = commentPhotos;
        try {
            setPosting(true);
            const res = await api.addMaintenanceReportNote(id, {
                note: text,
                staff_id: staff.id,
                created_by: staff.id,
                // `ready` is the backend's DRAFT flag, not a "send it" flag: a
                // note with `ready` set is filtered out for everyone except its
                // author. Comments posted here are public, so it stays false.
                ready: false,
            });
            const noteId = res?.maintenanceReportNote?.id ?? res?.data?.id ?? res?.id;

            // Photos hang off the saved note, so they need a second call with
            // its id. The comment itself is already posted at this point — a
            // failure here loses the photos, not the text, so say so rather
            // than failing the whole action.
            if (photos.length > 0) {
                try {
                    if (!noteId) throw new Error('The server did not return the new comment id.');
                    const form = new FormData();
                    form.append('id', String(noteId));
                    for (let i = 0; i < photos.length; i++) {
                        await appendPhotoToForm(
                            form,
                            `files[${i}]`,
                            photos[i],
                            `comment_${noteId}_${i + 1}.jpg`,
                        );
                    }
                    await api.requestForm(`maintenance-reports/${id}/notes/files`, 'POST', form);
                } catch (uploadErr) {
                    console.error('Comment photo upload error', uploadErr);
                    Alert.alert(
                        'Photos not attached',
                        'The comment was posted, but its photos failed to upload.'
                    );
                }
            }

            setCommentText('');
            setCommentPhotos([]);
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
            goBack();
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
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            </SafeAreaView>
        );
    }

    if (error || !ticket) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => goBack()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
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
    const notes = sortNewestFirst(Array.isArray(ticket.notes) ? ticket.notes : []);
    const isResolved = !!ticket.resolved;
    const canSendComment = !!commentText.trim() || commentPhotos.length > 0;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => goBack()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                        Ticket #{ticket.report_ref}
                    </Text>
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={() => setEditOpen(true)} disabled={busy} style={styles.iconBtn}>
                            <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDelete} disabled={busy} style={styles.iconBtn}>
                            <Ionicons name="trash-outline" size={20} color={colors.error || colors.warning} />
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.body}
                    keyboardShouldPersistTaps="handled"
                >
                    <Card>
                        <CardHeader>
                            <Ionicons name={p.icon} size={18} color={p.color(colors)} />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>
                                {ticket.title || 'Untitled'}
                            </Text>
                        </CardHeader>

                        <View style={[cardBodyPadding, styles.cardBody]}>
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
                                            : (colors.success),
                                        borderColor: colors.success,
                                        opacity: busy ? 0.6 : 1,
                                    },
                                ]}
                            >
                                {busy ? (
                                    <ActivityIndicator color={isResolved ? colors.success : colors.onPrimary} />
                                ) : (
                                    <>
                                        <Ionicons
                                            name={isResolved ? 'refresh-outline' : 'checkmark-circle-outline'}
                                            size={16}
                                            color={isResolved ? colors.success : colors.onPrimary}
                                        />
                                        <Text style={[
                                            styles.resolveBtnText,
                                            { color: isResolved ? colors.success : colors.onPrimary },
                                        ]}>
                                            {isResolved ? 'Reopen ticket' : 'Mark resolved'}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </Card>

                    <Card>
                        <CardHeader title="Comments" meta={notes.length} />
                        <View style={[cardBodyPadding, styles.commentList]}>
                            {notes.length === 0 ? (
                                <View style={[styles.emptyComments, { borderColor: colors.border }]}>
                                    <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>No comments yet.</Text>
                                </View>
                            ) : (
                                notes.map((c) => {
                                    const mine = c.staff?.id === staff?.id;
                                    const when = fmtDateTime(c.created_at || c.submitted_at);
                                    const photos = Array.isArray(c.photos) ? c.photos : [];
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
                                            </Text>
                                            {c.note ? (
                                                <Text style={[styles.commentText, { color: colors.textPrimary }]}>
                                                    {c.note}
                                                </Text>
                                            ) : null}
                                            {photos.length > 0 ? (
                                                <View style={styles.commentPhotos}>
                                                    {photos.map((ph, i) => (
                                                        <TouchableOpacity
                                                            key={ph.mediaId ?? `${c.id}-${i}`}
                                                            onPress={() => setViewerPhoto(ph.url)}
                                                            activeOpacity={0.85}
                                                        >
                                                            <Image
                                                                source={{ uri: ph.url }}
                                                                style={[styles.commentPhoto, { borderColor: colors.border }]}
                                                            />
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            ) : null}
                                            {when ? (
                                                <Text style={[styles.commentTime, { color: colors.textDisabled || colors.textSecondary }]}>
                                                    {when}
                                                </Text>
                                            ) : null}
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    </Card>
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
                            <ActivityIndicator color={colors.onPrimary} />
                        ) : (
                            <Ionicons name="send" size={18} color={colors.onPrimary} />
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

            <TicketFormModal
                visible={editOpen}
                onClose={() => setEditOpen(false)}
                onSaved={async () => { setEditOpen(false); await load(); }}
                staff={staff}
                existing={ticket}
            />

            {/* Full-screen look at a comment photo. Thumbnails in a chat bubble
                are too small to judge "is that the crack you mean?" by. */}
            <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
                <TouchableOpacity
                    style={styles.viewerBackdrop}
                    activeOpacity={1}
                    onPress={() => setViewerPhoto(null)}
                >
                    {viewerPhoto ? (
                        <Image source={{ uri: viewerPhoto }} style={styles.viewerImage} resizeMode="contain" />
                    ) : null}
                    <View style={styles.viewerClose}>
                        <Ionicons name="close" size={28} color="#fff" />
                    </View>
                </TouchableOpacity>
            </Modal>
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
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
    body: { padding: 16, gap: 14, paddingBottom: 24 },
    cardBody: { gap: 12 },
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
    commentList: { gap: cardGap },
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
    // The timestamp closes the bubble rather than sharing the author line: it
    // is the quietest thing in there and reads as a footer.
    commentTime: { fontSize: 10, marginTop: 2 },
    commentPhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    commentPhoto: { width: 96, height: 96, borderRadius: 8, borderWidth: 1 },
    composerWrap: { borderTopWidth: 1 },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    attachBtn: {
        width: 36, height: 36, borderRadius: 18, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
        // Nudged up so the two attach buttons sit centred against the 40pt send
        // button when the input is a single line.
        marginBottom: 2,
    },
    pendingRow: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2,
    },
    pendingWrap: { position: 'relative' },
    pendingThumb: { width: 60, height: 60, borderRadius: 8 },
    pendingRemove: {
        position: 'absolute', top: -5, right: -5,
        width: 20, height: 20, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    viewerBackdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
        alignItems: 'center', justifyContent: 'center',
    },
    viewerImage: { width: '100%', height: '80%' },
    viewerClose: { position: 'absolute', top: 48, right: 20 },
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
