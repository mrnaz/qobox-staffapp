import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Dimensions,
    useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoBack } from '../utils/nav';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { iconColor } from '../utils/iconColors';
import { canAddPhotos, visibilityMeta } from '../utils/albums';
import { capturePhotoCompressed, pickPhotosCompressed, appendPhotoToForm } from '../utils/photo';

// Three across, with a hairline of breathing room. The grid is sized from the
// window rather than a constant so it stays square on a rotated tablet.
const GRID_GAP = 3;
const COLUMNS = 3;

export default function AlbumDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id } = useLocalSearchParams();
    const goBack = useGoBack('/(main)/albums');
    const { width: windowWidth } = useWindowDimensions();

    const [album, setAlbum] = useState(null);
    const [abilities, setAbilities] = useState([]);
    const [staffId, setStaffId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(null);

    const load = useCallback(async () => {
        try {
            setError('');
            const res = await api.getPhotoAlbum(id);
            setAlbum(res?.photo_album || res?.data || res);
        } catch (err) {
            console.error('Album load error', err);
            // Never surface the server's own message here: a missing album
            // comes back as "No query results for model [App\\Models\\PhotoAlbum]",
            // which is a stack trace's worth of internals in front of a teacher.
            // The two statuses this endpoint actually returns get real copy.
            if (err.status === 404) {
                setError('That album no longer exists.');
            } else if (err.status === 403) {
                setError('You do not have access to this album.');
            } else {
                setError('Could not load this album. Pull down to try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        (async () => {
            const [abilitiesJson, staffJson] = await Promise.all([
                AsyncStorage.getItem('abilities'),
                AsyncStorage.getItem('staff'),
            ]);
            try { setAbilities(abilitiesJson ? JSON.parse(abilitiesJson) : []); } catch { setAbilities([]); }
            try { setStaffId(staffJson ? JSON.parse(staffJson)?.id : null); } catch { setStaffId(null); }
        })();
    }, []);

    useEffect(() => { load(); }, [load]);

    const photos = useMemo(
        () => (Array.isArray(album?.photos) ? album.photos : []),
        [album]
    );
    const mayAdd = canAddPhotos(album, abilities, staffId);
    const tileSize = Math.floor((windowWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

    const uploadPhotos = async (picked) => {
        if (!picked || picked.length === 0) return;
        try {
            setUploading(true);
            const form = new FormData();
            form.append('model', 'PhotoAlbum');
            form.append('model_id', String(id));
            // 'background' is the album's own image type; the server maps
            // PhotoAlbum + background onto the photo-album-background
            // collection, which is what the album reads its photos back from.
            form.append('imageType', 'background');
            for (let i = 0; i < picked.length; i++) {
                await appendPhotoToForm(form, `photos[${i}]`, picked[i], `album_${id}_${Date.now()}_${i + 1}.jpg`);
            }
            const res = await api.uploadAlbumPhotos(form);
            await load();
            // The endpoint reports per-file success, so a partial upload is a
            // real outcome rather than an error — say which ones landed.
            const uploaded = Array.isArray(res?.images) ? res.images.length : picked.length;
            if (uploaded < picked.length) {
                Alert.alert(
                    'Some photos were not added',
                    `${uploaded} of ${picked.length} uploaded. The rest were rejected — they may be too large or in an unsupported format.`
                );
            }
        } catch (err) {
            console.error('Album upload error', err);
            Alert.alert(
                'Could not add photos',
                err.body?.message || err.message || 'Please try again.'
            );
        } finally {
            setUploading(false);
        }
    };

    const handlePick = async () => {
        try {
            const picked = await pickPhotosCompressed(20);
            await uploadPhotos(picked);
        } catch (err) {
            console.error('Image picker error', err);
            Alert.alert('Photo library', err.message || 'Could not open the photo library.');
        }
    };

    const handleCapture = async () => {
        try {
            const photo = await capturePhotoCompressed();
            if (photo) await uploadPhotos([photo]);
        } catch (err) {
            console.error('Camera error', err);
            Alert.alert('Camera', err.message || 'Could not capture a photo.');
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            </SafeAreaView>
        );
    }

    if (error || !album) {
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
                        {error || 'Album not found.'}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const vis = visibilityMeta(album.visibility);
    const palette = colors[vis.palette];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => goBack()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {album.title || 'Untitled album'}
                    </Text>
                    <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
                        {album.last_edited_formatted ? ` · ${album.last_edited_formatted}` : ''}
                    </Text>
                </View>
                <View style={[styles.visPill, {
                    backgroundColor: palette?.background || colors.primary + '22',
                    borderColor: palette?.border || colors.primary,
                }]}>
                    <Text style={[styles.visText, { color: palette?.text || colors.primary }]}>{vis.label}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: mayAdd ? 96 : 24 }}>
                {album.description ? (
                    <Text style={[styles.desc, { color: colors.textSecondary, borderBottomColor: colors.border }]}>
                        {album.description}
                    </Text>
                ) : null}

                {photos.length === 0 ? (
                    <View style={styles.emptyBlock}>
                        <Ionicons name="images-outline" size={34} color={colors.textSecondary} />
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>
                            {mayAdd
                                ? 'No photos yet. Add the first one below.'
                                : 'No photos in this album yet.'}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.grid}>
                        {photos.map((photo, i) => (
                            <TouchableOpacity
                                key={photo.id ?? i}
                                onPress={() => setViewerIndex(i)}
                                activeOpacity={0.85}
                                style={{ width: tileSize, height: tileSize, marginRight: (i + 1) % COLUMNS ? GRID_GAP : 0, marginBottom: GRID_GAP }}
                            >
                                <Image
                                    source={{ uri: photo.thumb_photo || photo.main_photo || photo.original_url }}
                                    style={{ width: '100%', height: '100%', backgroundColor: colors.inputBackground || colors.surface }}
                                    resizeMode="cover"
                                />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Adding photos needs manage_albums or a full grant on this album;
                without either the bar is not rendered at all. */}
            {mayAdd ? (
                <View style={[styles.addBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                    <TouchableOpacity
                        onPress={handleCapture}
                        disabled={uploading}
                        style={[styles.addBtn, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground, opacity: uploading ? 0.6 : 1 }]}
                    >
                        <Ionicons name="camera-outline" size={18} color={iconColor('camera-outline', colors)} />
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>Take photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handlePick}
                        disabled={uploading}
                        style={[styles.addBtn, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground, opacity: uploading ? 0.6 : 1 }]}
                    >
                        {uploading ? (
                            <ActivityIndicator color={colors.primary} />
                        ) : (
                            <>
                                <Ionicons name="image-outline" size={18} color={iconColor('image-outline', colors)} />
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>Add photos</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            ) : null}

            <PhotoViewer
                photos={photos}
                index={viewerIndex}
                onChange={setViewerIndex}
                onClose={() => setViewerIndex(null)}
                colors={colors}
            />
        </SafeAreaView>
    );
}

// Full-screen photo, with the file name and description underneath and arrows
// to walk the album without going back to the grid each time.
function PhotoViewer({ photos, index, onChange, onClose, colors }) {
    const open = index !== null && index >= 0 && index < photos.length;
    const photo = open ? photos[index] : null;
    const { height } = Dimensions.get('window');

    return (
        <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.viewerBackdrop}>
                <TouchableOpacity style={styles.viewerClose} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.viewerStage} activeOpacity={1} onPress={onClose}>
                    {photo ? (
                        <Image
                            source={{ uri: photo.main_photo || photo.middle_photo || photo.original_url }}
                            style={{ width: '100%', height: height * 0.68 }}
                            resizeMode="contain"
                        />
                    ) : null}
                </TouchableOpacity>

                <View style={styles.viewerBar}>
                    <TouchableOpacity
                        onPress={() => onChange(index - 1)}
                        disabled={index <= 0}
                        style={[styles.viewerNav, { opacity: index <= 0 ? 0.3 : 1 }]}
                    >
                        <Ionicons name="chevron-back" size={22} color="#fff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.viewerName} numberOfLines={1}>
                            {photo?.name || photo?.file_name || 'Photo'}
                        </Text>
                        <Text style={styles.viewerMeta} numberOfLines={2}>
                            {index + 1} of {photos.length}
                            {photo?.description ? ` · ${photo.description}` : ''}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => onChange(index + 1)}
                        disabled={index >= photos.length - 1}
                        style={[styles.viewerNav, { opacity: index >= photos.length - 1 ? 0.3 : 1 }]}
                    >
                        <Ionicons name="chevron-forward" size={22} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
    },
    iconBtn: { padding: 8, minWidth: 40, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 1 },
    visPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, marginRight: 8 },
    visText: { fontSize: 11, fontWeight: '600' },
    desc: { fontSize: 13, lineHeight: 19, padding: 16, borderBottomWidth: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 70, gap: 10 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    addBar: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderTopWidth: 1,
    },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        flex: 1, paddingVertical: 12, borderWidth: 1, borderRadius: 10,
    },
    viewerBackdrop: { flex: 1, backgroundColor: 'rgba(8,8,12,.95)' },
    viewerClose: { position: 'absolute', top: 48, right: 20, zIndex: 2 },
    viewerStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    viewerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 34,
    },
    viewerNav: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,.12)',
    },
    viewerName: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
    viewerMeta: { color: '#b6b6c6', fontSize: 12, marginTop: 2, textAlign: 'center' },
});
