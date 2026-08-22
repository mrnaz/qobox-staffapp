import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
// SDK 54 moved the classic downloadAsync/documentDirectory API to the
// `/legacy` subpath (the default export is now the new File/Directory API).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { iconColor } from '../../utils/iconColors';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Card, { cardGap } from '../Card';

const getFileIcon = (fileName) => {
    if (!fileName) return 'file';
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'file-pdf-o';
        case 'doc':
        case 'docx': return 'file-word-o';
        case 'xls':
        case 'xlsx': return 'file-excel-o';
        case 'ppt':
        case 'pptx': return 'file-powerpoint-o';
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif': return 'file-image-o';
        case 'mp4':
        case 'avi':
        case 'mov': return 'file-video-o';
        case 'mp3':
        case 'wav': return 'file-audio-o';
        case 'zip':
        case 'rar': return 'file-archive-o';
        case 'txt': return 'file-text-o';
        default: return 'file';
    }
};

const getMimeType = (fileName) => {
    if (!fileName) return 'application/octet-stream';
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'doc': return 'application/msword';
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'xls': return 'application/vnd.ms-excel';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'ppt': return 'application/vnd.ms-powerpoint';
        case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'mp4': return 'video/mp4';
        case 'mov': return 'video/quicktime';
        case 'mp3': return 'audio/mpeg';
        case 'zip': return 'application/zip';
        case 'txt': return 'text/plain';
        default: return 'application/octet-stream';
    }
};

const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
};

// "Resources" tab — expandable folders of downloadable files. Ported from the
// client app's ResourcesTab into the staff app's card style.
export default function ResourcesTab({ classId }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [resources, setResources] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState(new Set());
    const [downloading, setDownloading] = useState(new Set());

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const res = await api.getClassResources(classId);
                const list = res?.class_resources || res?.resources || res?.data || res || [];
                setResources(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Class resources load error', err);
                setError(err.body?.message || err.message || 'Failed to load resources.');
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

    const toggle = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const downloadFile = async (file) => {
        const fileId = file.id || file.name || file.filename;
        if (downloading.has(fileId)) return;
        const url = file.original_url || file.url;
        if (!url) {
            Alert.alert('Error', 'File URL not available.');
            return;
        }
        const fileName = (file.name || file.filename || 'download').trim() || 'download';
        try {
            setDownloading((prev) => new Set(prev).add(fileId));
            const downloadResumable = FileSystem.createDownloadResumable(
                url,
                `${FileSystem.documentDirectory}${fileName}`
            );
            const { uri } = await downloadResumable.downloadAsync();
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: getMimeType(fileName),
                    dialogTitle: `Share ${fileName}`,
                });
            } else {
                Alert.alert('Downloaded', `File saved to: ${uri}`);
            }
        } catch (err) {
            console.error('Download error', err);
            Alert.alert('Error', 'Failed to download file. Please try again.');
        } finally {
            setDownloading((prev) => {
                const next = new Set(prev);
                next.delete(fileId);
                return next;
            });
        }
    };

    const renderFile = (file) => {
        const fileId = file.id || file.name || file.filename;
        const isDownloading = downloading.has(fileId);
        return (
            <TouchableOpacity
                key={fileId}
                onPress={() => !isDownloading && downloadFile(file)}
                disabled={isDownloading}
                style={[styles.fileRow, { backgroundColor: colors.inputBackground, borderColor: colors.border, opacity: isDownloading ? 0.7 : 1 }]}
            >
                <FontAwesome name={getFileIcon(file.name || file.filename)} size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {file.name || file.filename || 'Untitled file'}
                    </Text>
                    {file.size ? (
                        <Text style={[styles.fileSize, { color: colors.textSecondary }]}>{formatFileSize(file.size)}</Text>
                    ) : null}
                </View>
                {isDownloading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                    <FontAwesome name="download" size={16} color={colors.primary} />
                )}
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item }) => {
        const isExpanded = expanded.has(item.id);
        const files = Array.isArray(item.files) ? item.files.filter((f) => f && (f.name || f.filename)) : [];
        const hasFiles = files.length > 0;
        return (
            <Card>
                <TouchableOpacity
                    style={[styles.folderHead, { opacity: hasFiles ? 1 : 0.6 }]}
                    onPress={() => hasFiles && toggle(item.id)}
                    disabled={!hasFiles}
                >
                    <FontAwesome
                        name={hasFiles ? 'folder' : 'folder-o'}
                        size={20}
                        color={hasFiles ? iconColor('folder', colors) : colors.textDisabled}
                        style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.folderTitle, { color: hasFiles ? colors.textPrimary : colors.textDisabled }]}>
                            {item.title || item.name || 'Untitled resource'}
                        </Text>
                        {item.description ? (
                            <Text style={[styles.folderDesc, { color: hasFiles ? colors.textSecondary : colors.textDisabled }]}>
                                {item.description}
                            </Text>
                        ) : null}
                        <Text style={[styles.folderMeta, { color: hasFiles ? colors.textSecondary : colors.textDisabled }]}>
                            {hasFiles ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'No files available'}
                        </Text>
                    </View>
                    <FontAwesome
                        name={hasFiles ? (isExpanded ? 'chevron-up' : 'chevron-down') : 'exclamation-circle'}
                        size={16}
                        color={hasFiles ? colors.primary : colors.textDisabled}
                    />
                </TouchableOpacity>
                {isExpanded && hasFiles ? (
                    <View style={styles.fileList}>{files.map(renderFile)}</View>
                ) : null}
            </Card>
        );
    };

    if (isLoading && resources.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && resources.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="folder-outline" size={32} color={iconColor('folder-outline', colors)} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <FlatList
            data={resources}
            keyExtractor={(it, i) => String(it.id ?? i)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="folder-outline" size={32} color={iconColor('folder-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No resources for this class.</Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    list: { padding: 16, paddingBottom: 32, gap: cardGap },
    folderHead: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    folderTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    folderDesc: { fontSize: 12, marginBottom: 2 },
    folderMeta: { fontSize: 11 },
    fileList: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        marginLeft: 24,
    },
    fileName: { fontSize: 13 },
    fileSize: { fontSize: 11 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
