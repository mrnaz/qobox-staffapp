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
    Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Card, { CardHeader, cardBodyPadding, cardGap } from '../components/Card';
import AlbumFormModal from '../components/AlbumFormModal';
import { iconColor } from '../utils/iconColors';
import { canCreateAlbum, visibilityMeta, sortAlbums, albumCover } from '../utils/albums';

export default function AlbumsScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [albums, setAlbums] = useState([]);
    const [abilities, setAbilities] = useState([]);
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            const json = await AsyncStorage.getItem('abilities');
            try { setAbilities(json ? JSON.parse(json) : []); } catch { setAbilities([]); }
        })();
    }, []);

    const load = useCallback(async (opts = {}) => {
        try {
            if (!opts.refresh) setIsLoading(true);
            setError('');
            const res = await api.getPhotoAlbums();
            const list = res?.photo_albums || res?.data || [];
            setAlbums(sortAlbums(Array.isArray(list) ? list : []));
        } catch (err) {
            console.error('Albums load error', err);
            // Same reasoning as the album screen: the server's message is
            // written for a developer reading a stack trace, not for staff.
            setError('Could not load albums. Check your connection and try again.');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Reload on focus so a photo added inside an album updates its count here.
    useFocusEffect(useCallback(() => { load({ refresh: albums.length > 0 }); }, [load]));

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const q = search.trim().toLowerCase();
    const visible = q
        ? albums.filter((a) =>
            `${a.title || ''} ${a.description || ''}`.toLowerCase().includes(q))
        : albums;

    const renderItem = ({ item }) => {
        const photos = Array.isArray(item.photos) ? item.photos : [];
        const vis = visibilityMeta(item.visibility);
        const palette = colors[vis.palette];
        const cover = albumCover(item);

        return (
            <Card onPress={() => router.push(`/albums/${item.id}`)} activeOpacity={0.85}>
                <CardHeader style={styles.cardHeader}>
                    <Ionicons name="images-outline" size={16} color={iconColor('images-outline', colors)} />
                    <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.title || 'Untitled album'}
                    </Text>
                    <View style={[styles.visPill, {
                        backgroundColor: palette?.background || colors.primary + '22',
                        borderColor: palette?.border || colors.primary,
                    }]}>
                        <Text style={[styles.visText, { color: palette?.text || colors.primary }]}>
                            {vis.label}
                        </Text>
                    </View>
                </CardHeader>

                {/* The cover is the album's first photo. An album with none is
                    still worth showing — it is where you go to add the first. */}
                {cover ? (
                    <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
                ) : (
                    <View style={[styles.coverEmpty, { backgroundColor: colors.inputBackground || colors.background }]}>
                        <Ionicons name="image-outline" size={26} color={colors.textDisabled || colors.textSecondary} />
                    </View>
                )}

                <View style={[cardBodyPadding, styles.cardBody]}>
                    {item.description ? (
                        <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>
                            {item.description}
                        </Text>
                    ) : null}
                    <View style={styles.metaRow}>
                        <Text style={[styles.meta, { color: colors.textSecondary }]}>
                            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
                        </Text>
                        {item.last_edited_formatted ? (
                            <Text style={[styles.meta, { color: colors.textSecondary, marginLeft: 'auto' }]} numberOfLines={1}>
                                {item.last_edited_formatted}
                            </Text>
                        ) : null}
                    </View>
                </View>
            </Card>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.toolbar}>
                <View style={[styles.searchBox, { backgroundColor: colors.cardBackground, borderColor: colors.borderStrong || colors.border }]}>
                    <Ionicons name="search" size={16} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        placeholder="Search albums"
                        placeholderTextColor={colors.textSecondary}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {search ? (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {isLoading && albums.length === 0 ? (
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : error && albums.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={visible}
                    keyExtractor={(it) => String(it.id)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="images-outline" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                {search
                                    ? 'No albums match your search.'
                                    : canCreateAlbum(abilities)
                                        ? 'No albums yet. Tap + to create one.'
                                        : 'No albums have been shared with you.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Creating an album needs the manage_albums ability, so staff
                without it never see the button rather than meeting a 403. */}
            {canCreateAlbum(abilities) ? (
                <TouchableOpacity
                    style={[styles.fab, { backgroundColor: colors.primary }]}
                    onPress={() => setCreateOpen(true)}
                    activeOpacity={0.8}
                >
                    <Ionicons name="add" size={28} color="#fff" />
                </TouchableOpacity>
            ) : null}

            <AlbumFormModal
                visible={createOpen}
                onClose={() => setCreateOpen(false)}
                onSaved={async () => { setCreateOpen(false); await load({ refresh: true }); }}
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
    list: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: cardGap },
    cardHeader: { justifyContent: 'flex-start' },
    title: { fontSize: 15, fontWeight: '700', flex: 1 },
    visPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    visText: { fontSize: 11, fontWeight: '600' },
    cover: { width: '100%', height: 150 },
    coverEmpty: { width: '100%', height: 90, alignItems: 'center', justifyContent: 'center' },
    cardBody: { gap: 6 },
    desc: { fontSize: 13, lineHeight: 18 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    meta: { fontSize: 11 },
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
