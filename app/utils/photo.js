import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// Scale-to-fit inside a 2000x2000 box, JPG @ 90% — small enough for service
// tickets and check-in evidence without sacrificing usability for review.
const MAX_DIMENSION = 2000;
const JPG_QUALITY = 0.9;

const computeFit = (width, height) => {
    if (!width || !height) return null;
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) return null;
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
};

const compress = async (asset) => {
    const fit = computeFit(asset.width, asset.height);
    const actions = fit ? [{ resize: fit }] : [];
    const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: JPG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg' };
};

export const capturePhotoCompressed = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
        const err = new Error('Camera permission was denied.');
        err.code = 'CAMERA_PERMISSION_DENIED';
        throw err;
    }
    const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset) return null;
    return compress(asset);
};

// Append a photo to a FormData payload in a way that works on BOTH native and
// web. On native RN, FormData accepts a `{ uri, name, type }` object directly.
// On web, it does NOT — you must hand it a real Blob/File. Without this helper
// the file silently uploads as the literal string "[object Object]" and the
// server's hasFile() check sees no file.
export const appendPhotoToForm = async (form, fieldName, photo, fileName) => {
    if (!photo?.uri) return;
    const name = fileName || 'photo.jpg';
    const type = photo.mimeType || 'image/jpeg';
    if (Platform.OS === 'web') {
        const res = await fetch(photo.uri);
        const blob = await res.blob();
        form.append(fieldName, blob, name);
    } else {
        form.append(fieldName, { uri: photo.uri, name, type });
    }
};

// Multi-select from the library. The album upload endpoint takes at most 20
// files per request, so the picker is capped at the same number rather than
// letting someone choose 60 and lose 40 of them at the server.
export const pickPhotosCompressed = async (limit = 20) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
        const err = new Error('Photo library permission was denied.');
        err.code = 'LIBRARY_PERMISSION_DENIED';
        throw err;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: limit,
    });
    if (result.canceled) return [];
    const assets = Array.isArray(result.assets) ? result.assets : [];
    // Compressed one at a time on purpose: ImageManipulator holds the decoded
    // bitmap in memory, and a parallel map over twenty full-resolution photos
    // is a good way to get killed by the OS on an older device.
    const out = [];
    for (const asset of assets.slice(0, limit)) {
        out.push(await compress(asset));
    }
    return out;
};

export const pickPhotoCompressed = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
        const err = new Error('Photo library permission was denied.');
        err.code = 'LIBRARY_PERMISSION_DENIED';
        throw err;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset) return null;
    return compress(asset);
};
