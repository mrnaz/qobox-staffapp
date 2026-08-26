// Album permissions, mirrored from the backend so the UI only offers actions
// that will actually succeed.
//
// The server's rules (PhotoAlbumPolicy + PhotoAlbumsController):
//   - seeing an album  → handled server-side; the list endpoint already returns
//                        only what this staff member may open, so there is
//                        nothing to check here.
//   - creating one     → the `manage_albums` ability.
//   - adding photos    → `manage_albums`, or a full ('f') grant on that album.
//                        The controller's own remove_photo check uses the same
//                        pair (plus "you uploaded it"), which is the closest
//                        thing the backend has to a definition of write access
//                        on a single album.
//
// Sysadmins carry every ability implicitly, the same way DailyAttendanceModal
// treats them.

export const SYSADMIN = 'sysadmin';

const has = (abilities, ability) =>
    Array.isArray(abilities) && (abilities.includes(ability) || abilities.includes(SYSADMIN));

// Full-access grant for this staff member on this album.
const hasFullAccess = (album, staffId) => {
    if (!staffId) return false;
    const grants = Array.isArray(album?.photo_album_access) ? album.photo_album_access : [];
    return grants.some((g) => String(g.staff_id) === String(staffId) && g.permission === 'f');
};

export const canCreateAlbum = (abilities) => has(abilities, 'manage_albums');

export const canAddPhotos = (album, abilities, staffId) =>
    has(abilities, 'manage_albums') || hasFullAccess(album, staffId);

// Visibility reads as a chip on the album card. Public is the quiet default —
// it carries no restriction worth flagging — so only the narrower two get a
// tint that pulls the eye.
export const VISIBILITY_META = {
    public: { label: 'Public', icon: 'globe-outline', palette: 'steel' },
    restricted: { label: 'Restricted', icon: 'people-outline', palette: 'amber' },
    private: { label: 'Private', icon: 'lock-closed-outline', palette: 'ruby' },
};

export const visibilityMeta = (visibility) =>
    VISIBILITY_META[visibility] || VISIBILITY_META.public;

// The album list arrives unsorted. Most recently touched first, falling back to
// id so albums with no photos yet still land in a stable order.
export const sortAlbums = (albums) =>
    [...albums].sort((a, b) => {
        const ap = (a.photos || []).length;
        const bp = (b.photos || []).length;
        if (!ap && !bp) return (b.id ?? 0) - (a.id ?? 0);
        if (!ap) return 1;
        if (!bp) return -1;
        return (b.id ?? 0) - (a.id ?? 0);
    });

// First photo doubles as the cover: the backend's `cover` field reads a
// collection nothing writes to, so it is always null in practice.
export const albumCover = (album) => {
    const photos = Array.isArray(album?.photos) ? album.photos : [];
    if (!photos.length) return null;
    const first = photos[0];
    return first.middle_photo || first.main_photo || first.thumb_photo || first.original_url || null;
};
