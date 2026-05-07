// Single source of truth for AsyncStorage keys.
// Keep these in sync with the cleanup list in authFlow.clearAuthStorage and
// the redirect-to-login cleanup in api.request.
export const STORAGE_KEYS = {
    accessToken: 'accessToken',
    authToken: 'authToken',
    pendingToken: 'pendingToken',
    staff: 'staff',
    roles: 'roles',
    abilities: 'abilities',
    organisationId: 'organisationId',
    siteId: 'siteId',
    profilePhoto: 'profilePhoto',
    mfaDeviceToken: 'mfaDeviceToken',
    academicPeriodId: 'academicPeriodId',
};

// Every key that should be wiped on logout / 401.
export const ALL_AUTH_KEYS = Object.values(STORAGE_KEYS);

export default STORAGE_KEYS;
