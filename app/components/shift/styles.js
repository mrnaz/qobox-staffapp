import { StyleSheet } from 'react-native';

// Modal chrome shared by the check-in, check-out and QR sheets. Lifted verbatim
// from the Roster screen so the sheets look identical wherever they are opened.
export default StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    modalCard: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 18,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    iconButton: { padding: 4 },
    detailLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    halfButton: { flex: 1, justifyContent: 'center' },
    noteInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minHeight: 72,
        fontSize: 14,
    },
    photoPreview: {
        width: '100%',
        height: 180,
        borderRadius: 8,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        flex: 1,
    },
    btnText: { color: '#fff', fontWeight: '700' },
    btnOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        flex: 1,
    },
    btnOutlineText: { fontWeight: '700' },
    qrBox: {
        alignItems: 'center',
        padding: 16,
    },
    qrHint: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
    message: { fontSize: 14, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 12 },
});
