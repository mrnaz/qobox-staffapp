import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    AppState,
    Linking,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import Theme from '../context/ThemeContext';
import api from '../services/api';
import { clearAuthStorage } from '../utils/authFlow';

// Blocks the app until the staff member has agreed to the current version of
// every system doc (Terms, Privacy Policy, ...) that staff must agree to. The
// server decides what is outstanding and records each agreement; this only
// walks through the list one doc at a time. The only ways out are agreeing or
// signing out.
export default function SystemDocAgreementsModal() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [queue, setQueue] = useState([]);
    const [agreed, setAgreed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const appState = useRef(AppState.currentState);

    const current = queue[0] ?? null;

    const load = useCallback(async () => {
        try {
            const list = await api.getSystemDocAgreements();
            setQueue(Array.isArray(list) ? list : []);
            setAgreed(false);
            setError('');
        } catch (e) {
            // A failed check must not lock everyone out; it runs again the next
            // time the app comes to the foreground.
            console.error('Error loading system doc agreements:', e);
        }
    }, []);

    useEffect(() => {
        load();

        // A new version can be published while the app sits in the background.
        const sub = AppState.addEventListener('change', (next) => {
            if (appState.current.match(/inactive|background/) && next === 'active') load();
            appState.current = next;
        });

        return () => sub.remove();
    }, [load]);

    const agree = async () => {
        if (!current || !agreed) return;

        setBusy(true);
        setError('');
        try {
            await api.agreeToSystemDoc({
                system_doc_id: current.system_doc_id,
                system_doc_version_id: current.system_doc_version_id,
                accepted_via: 'app',
            });
            setQueue((q) => q.slice(1));
            setAgreed(false);
        } catch (e) {
            setError(e?.body?.message || 'Could not record your agreement. Please try again.');
            // 409: a newer version was published while this one was open.
            if (e?.status === 409) await load();
        } finally {
            setBusy(false);
        }
    };

    const signOut = async () => {
        setBusy(true);
        try {
            try { await api.logout(); } catch { /* server-side logout errors are non-fatal */ }
        } finally {
            await clearAuthStorage();
            setQueue([]);
            setBusy(false);
            router.replace('/(auth)/login');
        }
    };

    const openDoc = () => {
        Linking.openURL(current.url).catch((e) => console.error('Could not open document:', e));
    };

    const formatDate = (value) => {
        const d = value ? new Date(value) : null;
        return d && !isNaN(d) ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    };

    if (!current) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>{current.title}</Text>
                        {queue.length > 1 ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                                1 of {queue.length}
                            </Text>
                        ) : null}
                    </View>

                    <Text style={[styles.message, { color: colors.textSecondary }]}>
                        Please review and agree to the {current.title}.
                    </Text>

                    <TouchableOpacity
                        onPress={openDoc}
                        style={[styles.readBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                    >
                        <FontAwesome name="external-link" size={14} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontWeight: '600', flexShrink: 1 }}>
                            Read the {current.title}
                        </Text>
                    </TouchableOpacity>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        Version {current.version}, published {formatDate(current.published_at)}
                    </Text>

                    <TouchableOpacity
                        onPress={() => setAgreed((v) => !v)}
                        disabled={busy}
                        style={styles.checkRow}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: agreed }}
                    >
                        <Ionicons
                            name={agreed ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={agreed ? colors.primary : colors.textSecondary}
                        />
                        <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
                            I have read and agree to the {current.title}.
                        </Text>
                    </TouchableOpacity>

                    {error ? <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text> : null}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            onPress={signOut}
                            disabled={busy}
                            style={[styles.btn, styles.btnGhost, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
                        >
                            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Sign Out</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={agree}
                            disabled={busy || !agreed}
                            style={[styles.btn, { backgroundColor: colors.primary, opacity: busy || !agreed ? 0.5 : 1 }]}
                        >
                            {busy ? (
                                <ActivityIndicator color={colors.onPrimary} />
                            ) : (
                                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Agree</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        borderWidth: 1,
        borderRadius: 14,
        padding: 20,
        gap: 12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 17, fontWeight: '700', flex: 1 },
    message: { fontSize: 14, lineHeight: 20 },
    readBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
    btn: {
        minWidth: 90,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGhost: { borderWidth: 1, backgroundColor: 'transparent' },
});
