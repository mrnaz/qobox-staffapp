import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Modal,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Alert,
} from 'react-native';
import RenderHtml from 'react-native-render-html';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';
import Avatar from './Avatar';
import Card from './Card';
import api from '../services/api';
import endpoints from '../constants/endpoints';

// Text-to-speech is optional: a build made before expo-speech was added has no
// native module, and requiring it there throws. The menu still opens in that
// case — "Read aloud" just explains it needs a rebuild.
let Speech = null;
try {
    Speech = require('expo-speech');
} catch { /* not linked in this build */ }

// Same list, same order as the client app's notice menu.
const LANGUAGES = [
    { code: 'ar', label: 'Arabic' },
    { code: 'zh', label: 'Chinese' },
    { code: 'da', label: 'Danish' },
    { code: 'nl', label: 'Dutch' },
    { code: 'en', label: 'English' },
    { code: 'fi', label: 'Finnish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'hi', label: 'Hindi' },
    { code: 'it', label: 'Italian' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'no', label: 'Norwegian' },
    { code: 'pl', label: 'Polish' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ru', label: 'Russian' },
    { code: 'so', label: 'Somali' },
    { code: 'es', label: 'Spanish' },
    { code: 'sv', label: 'Swedish' },
    { code: 'th', label: 'Thai' },
    { code: 'tr', label: 'Turkish' },
    { code: 'vi', label: 'Vietnamese' },
];

// The locale expo-speech wants, keyed by the translation language code.
const SPEECH_LOCALE = {
    ar: 'ar-SA', zh: 'zh-CN', da: 'da-DK', nl: 'nl-NL', en: 'en-US',
    fi: 'fi-FI', fr: 'fr-FR', de: 'de-DE', hi: 'hi-IN', it: 'it-IT',
    ja: 'ja-JP', ko: 'ko-KR', no: 'nb-NO', pl: 'pl-PL', pt: 'pt-BR',
    ru: 'ru-RU', so: 'so-SO', es: 'es-ES', sv: 'sv-SE', th: 'th-TH',
    tr: 'tr-TR', vi: 'vi-VN',
};

// post_scope → theme color group (matching the client app's NoticeboardList)
const SCOPE_PALETTE = {
    classes:      'azure',
    client_clubs: 'turquoise',
    staff_teams:  'emerald',
    global:       'purple',
    courses:      'teal',
};

export const stripHtml = (html = '') =>
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

export const relativeTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const htmlStyles = (colors) => ({
    p:      { marginVertical: 4, color: colors.textSecondary },
    h1:     { fontSize: 18, fontWeight: 'bold', marginVertical: 8, color: colors.textPrimary },
    h2:     { fontSize: 16, fontWeight: 'bold', marginVertical: 6, color: colors.textPrimary },
    h3:     { fontSize: 15, fontWeight: '600', marginVertical: 4, color: colors.textPrimary },
    b:      { fontWeight: 'bold', color: colors.textSecondary },
    strong: { fontWeight: 'bold', color: colors.textSecondary },
    i:      { fontStyle: 'italic', color: colors.textSecondary },
    em:     { fontStyle: 'italic', color: colors.textSecondary },
    a:      { color: colors.primary, textDecorationLine: 'underline' },
    ul:     { marginVertical: 4, paddingLeft: 16 },
    ol:     { marginVertical: 4, paddingLeft: 16 },
    li:     { marginVertical: 2, color: colors.textSecondary },
});

// One noticeboard post, as the dashboard renders it: author, time, scope chip,
// title and a body that expands in place. The ⋮ menu carries Translate and
// Read aloud, mirroring the client app.
//
// The card owns its own expand/translate/speech state so the same component
// drops into any list without the screen having to track any of it.
export default function NoticeCard({ notice }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [isExpanded, setIsExpanded] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [languageListVisible, setLanguageListVisible] = useState(false);
    const [translation, setTranslation] = useState(null); // { title, body }
    const [language, setLanguage] = useState('en');
    const [isTranslating, setIsTranslating] = useState(false);
    const [translateError, setTranslateError] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Leaving the screen mid-sentence should not keep the phone talking.
    useEffect(() => () => { if (Speech) { try { Speech.stop(); } catch { /* ignore */ } } }, []);

    const closeMenu = () => {
        setMenuVisible(false);
        setLanguageListVisible(false);
    };

    const title = translation?.title ?? notice.title;
    const body = translation?.body ?? notice.body;
    const plainBody = stripHtml(body);

    const translate = async (code) => {
        closeMenu();
        // English is the source text, so there is nothing to fetch — drop back
        // to what the API already gave us.
        if (code === 'en') {
            setTranslation(null);
            setLanguage('en');
            setTranslateError('');
            return;
        }
        if (code === language && translation) return;

        setIsTranslating(true);
        setTranslateError('');
        try {
            const res = await api.post(
                endpoints.TRANSLATE_NOTICEBOARD.replace('{id}', notice.id),
                { language: code }
            );
            setTranslation({ title: res.translated_title, body: res.translated_body });
            setLanguage(code);
        } catch (err) {
            console.error('Notice translate error', err);
            setTranslateError('Translation failed');
        } finally {
            setIsTranslating(false);
        }
    };

    const stopSpeaking = () => {
        try { Speech?.stop(); } catch { /* ignore */ }
        setIsSpeaking(false);
    };

    const readAloud = () => {
        closeMenu();
        if (!Speech) {
            Alert.alert('Not available', 'Reading aloud needs a newer build of the app.');
            return;
        }
        if (isSpeaking) {
            stopSpeaking();
            return;
        }
        // Only one notice reads at a time; stopping first also clears anything
        // another card left running.
        try { Speech.stop(); } catch { /* ignore */ }

        const spoken = `${title || ''}. ${plainBody}`.trim();
        if (!spoken) return;

        setIsSpeaking(true);
        Speech.speak(spoken, {
            language: SPEECH_LOCALE[language] || 'en-US',
            pitch: 1.0,
            rate: Platform.OS === 'ios' ? 0.5 : 0.9,
            onDone: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
        });
    };

    const palette = colors[SCOPE_PALETTE[notice.post_scope] || 'indigo'];

    return (
        <Card onPress={() => setIsExpanded((v) => !v)} activeOpacity={0.8}>
            {/* Heading matched to the client app's notice card: a plain row on
                the card rather than a tinted band, avatar 38, author 14/700
                over a 12pt timestamp. The overflow menu stays — the client has
                one too — and the avatar takes a ring, which is the one place
                this deliberately differs from the client. */}
            <View style={styles.header}>
                <Avatar
                    uri={notice.photo}
                    name={notice.author_name}
                    id={notice.author_id}
                    size={38}
                    bordered
                />
                <View style={styles.headerText}>
                    <Text style={[styles.author, { color: colors.textPrimary }]} numberOfLines={1}>
                        {notice.author_name || 'Unknown'}
                    </Text>
                    <Text style={[styles.time, { color: colors.textSecondary }]}>
                        {relativeTime(notice.scheduled || notice.created_at)}
                    </Text>
                </View>
                {notice.chip_label ? (
                    <View style={[styles.chip, {
                        backgroundColor: palette?.background || colors.primary + '22',
                        borderColor: palette?.border || colors.primary,
                    }]}>
                        <Text style={[styles.chipText, { color: palette?.text || colors.primary }]} numberOfLines={1}>
                            {notice.chip_label}
                        </Text>
                    </View>
                ) : null}
                <TouchableOpacity
                    onPress={() => setMenuVisible(true)}
                    style={styles.menuBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="ellipsis-vertical" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.body}>
                {title ? (
                    <Text
                        style={[styles.title, { color: colors.textPrimary }]}
                        numberOfLines={isExpanded ? undefined : 2}
                    >
                        {title}
                    </Text>
                ) : null}

                {isTranslating ? (
                    <View style={[styles.statusPill, { backgroundColor: colors.primary + '15' }]}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={[styles.statusText, { color: colors.primary }]}>Translating…</Text>
                    </View>
                ) : null}

                {isSpeaking ? (
                    <View style={[styles.statusPill, {
                        backgroundColor: (colors.success || colors.primary) + '20',
                        borderWidth: 1,
                        borderColor: colors.success || colors.primary,
                    }]}>
                        <Ionicons name="volume-high-outline" size={14} color={colors.success || colors.primary} />
                        <Text style={[styles.statusText, { color: colors.success || colors.primary, flex: 1 }]}>
                            Reading aloud
                        </Text>
                        <TouchableOpacity onPress={stopSpeaking} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={[styles.statusText, { color: colors.error }]}>Stop</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {translateError ? (
                    <Text style={[styles.errorText, { color: colors.error }]}>{translateError}</Text>
                ) : null}

                {body ? (
                    isExpanded ? (
                        <View style={{ marginTop: 4 }}>
                            <RenderHtml
                                contentWidth={Dimensions.get('window').width - 64}
                                source={{ html: body }}
                                baseStyle={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}
                                tagsStyles={htmlStyles(colors)}
                            />
                        </View>
                    ) : (
                        <Text style={[styles.bodyText, { color: colors.textSecondary }]} numberOfLines={4}>
                            {plainBody}
                        </Text>
                    )
                ) : null}

                {body && plainBody.length > 100 ? (
                    <View style={styles.expandHint}>
                        <Text style={[styles.expandHintText, { color: colors.primary }]}>
                            {isExpanded ? 'Show less' : 'Read more'}
                        </Text>
                        <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={colors.primary}
                        />
                    </View>
                ) : null}
            </View>

            {/* Options menu */}
            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
                <TouchableOpacity activeOpacity={1} onPress={closeMenu} style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 340 }}>
                        <View style={[styles.sheet, {
                            backgroundColor: colors.cardBackground,
                            borderColor: colors.border,
                        }]}>
                            <View style={[styles.sheetHead, { borderBottomColor: colors.border }]}>
                                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Options</Text>
                            </View>

                            {!languageListVisible ? (
                                <>
                                    <TouchableOpacity
                                        onPress={() => setLanguageListVisible(true)}
                                        style={[styles.sheetRow, { borderBottomColor: colors.border }]}
                                    >
                                        <FontAwesome name="language" size={18} color={colors.textSecondary} />
                                        <Text style={[styles.sheetRowText, { color: colors.textPrimary }]}>Translate</Text>
                                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={readAloud} style={[styles.sheetRow, { borderBottomWidth: 0 }]}>
                                        <Ionicons
                                            name={isSpeaking ? 'stop-circle-outline' : 'volume-high-outline'}
                                            size={18}
                                            color={isSpeaking ? colors.error : colors.textSecondary}
                                        />
                                        <Text style={[styles.sheetRowText, { color: colors.textPrimary }]}>
                                            {isSpeaking ? 'Stop reading' : 'Read aloud'}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <TouchableOpacity
                                        onPress={() => setLanguageListVisible(false)}
                                        style={[styles.sheetRow, { borderBottomColor: colors.border, paddingVertical: 12 }]}
                                    >
                                        <Ionicons name="chevron-back" size={16} color={colors.primary} />
                                        <Text style={[styles.sheetRowText, { color: colors.primary }]}>Back</Text>
                                    </TouchableOpacity>
                                    <ScrollView style={{ maxHeight: 300 }}>
                                        {LANGUAGES.map((lang) => (
                                            <TouchableOpacity
                                                key={lang.code}
                                                onPress={() => translate(lang.code)}
                                                style={[styles.sheetRow, {
                                                    borderBottomColor: colors.border,
                                                    backgroundColor: language === lang.code ? colors.primary + '20' : 'transparent',
                                                }]}
                                            >
                                                <Text style={[styles.sheetRowText, { color: colors.textPrimary }]}>
                                                    {lang.label}
                                                </Text>
                                                {language === lang.code ? (
                                                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                                                ) : null}
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </>
                            )}

                            <TouchableOpacity
                                onPress={closeMenu}
                                style={[styles.sheetCancel, { borderTopColor: colors.border }]}
                            >
                                <Text style={{ color: colors.error, fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </Card>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        // Top-aligned, so a two-line chip or a long name does not drag the
        // avatar down the card.
        alignItems: 'flex-start',
        paddingHorizontal: 14,
        paddingTop: 14,
    },
    headerText: { flex: 1, marginLeft: 10 },
    author: { fontSize: 14, fontWeight: '700' },
    time: { fontSize: 12, marginTop: 1 },
    menuBtn: { marginLeft: 8, padding: 4 },
    chip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginLeft: 8,
        maxWidth: 150,
    },
    chipText: { fontSize: 11, fontWeight: '600' },
    body: { gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
    title: { fontSize: 14, fontWeight: '600' },
    bodyText: { fontSize: 13, lineHeight: 19 },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    statusText: { fontSize: 12, fontWeight: '600' },
    errorText: { fontSize: 12 },
    expandHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    expandHintText: { fontSize: 12, fontWeight: '600' },

    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    sheet: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
    sheetHead: { padding: 16, borderBottomWidth: 1 },
    sheetTitle: { fontSize: 16, fontWeight: '600' },
    sheetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    sheetRowText: { flex: 1, fontSize: 15 },
    sheetCancel: { padding: 16, borderTopWidth: 1, alignItems: 'center' },
});
