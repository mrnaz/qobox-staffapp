import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { ALL_AUTH_KEYS } from '../constants/storageKeys';

export const clearAuthStorage = async () => {
    await AsyncStorage.multiRemove(ALL_AUTH_KEYS);
};

export const persistAuth = async ({
    token,
    staff,
    roles,
    abilities,
    organisationId,
    siteId,
    deviceToken,
}) => {
    // Wipe any intermediate state from a previous attempt
    await clearAuthStorage();

    const entries = [
        ['authToken', token],
        ['accessToken', token],
    ];
    if (staff !== undefined) entries.push(['staff', JSON.stringify(staff)]);
    if (roles !== undefined) entries.push(['roles', JSON.stringify(roles)]);
    if (abilities !== undefined) entries.push(['abilities', JSON.stringify(abilities)]);
    if (organisationId !== undefined && organisationId !== null) {
        entries.push(['organisationId', String(organisationId)]);
    }
    if (siteId !== undefined && siteId !== null) {
        entries.push(['siteId', String(siteId)]);
    }
    if (deviceToken) entries.push(['mfaDeviceToken', deviceToken]);
    await AsyncStorage.multiSet(entries);
    api.setToken(token);
};

const stashPendingToken = async (token) => {
    api.setToken(token);
    await AsyncStorage.setItem('pendingToken', token);
};

const isFirewallBlocked = (errorOrResponse) =>
    errorOrResponse?.firewall_blocked === true ||
    errorOrResponse?.body?.firewall_blocked === true ||
    (errorOrResponse?.status === 403 && errorOrResponse?.body?.firewall_blocked === true);

const firewallMessage = (errorOrResponse) =>
    errorOrResponse?.body?.message ||
    errorOrResponse?.message ||
    'You cannot log in from your current location.';

const routeToOtp = async (otpToken, maskedMFA, router) => {
    await stashPendingToken(otpToken);
    router.replace({
        pathname: '/(auth)/otp',
        params: { maskedMFA: maskedMFA || '' },
    });
};

const finalizeFromSelectSite = async (siteRes, role, router) => {
    // `role` is the chosen StaffRole (org_id, site_id) — required.
    // `siteRes` is the /select-site response (token, roles, abilities, staff).
    // Note: MeTransformer doesn't include organisation_id, so we rely on `role`.
    await persistAuth({
        token: siteRes.token,
        staff: siteRes.staff,
        roles: siteRes.roles,
        abilities: siteRes.abilities,
        organisationId: role?.org_id,
        siteId: role?.site_id,
    });
    router.replace('/(main)');
};

// Given a response from /login OR /check-otp (when not site_selected),
// figure out where the user should land next.
export const routePostAuth = async (response, router) => {
    // No roles → sysadmin or profile-only user, done
    if (!response.roles) {
        await persistAuth({
            token: response.token,
            staff: response.staff,
            abilities:
                response.abilities ??
                (response.staff?.type === 'sysadmin' ? ['sysadmin'] : []),
        });
        router.replace('/(main)');
        return;
    }

    const roles = response.roles;

    // All roles share one site → auto-select
    const allSameSite = roles.length > 0 && roles.every((r) => r.site_id === roles[0].site_id);
    if (allSameSite) {
        await stashPendingToken(response.token);

        let siteRes;
        try {
            siteRes = await api.selectSite(roles[0].site_id);
        } catch (err) {
            if (isFirewallBlocked(err)) {
                const e = new Error(firewallMessage(err));
                e.firewall_blocked = true;
                throw e;
            }
            throw err;
        }

        if (siteRes?.mfa_required) {
            await routeToOtp(siteRes.otpToken, siteRes.maskedMFA, router);
            return;
        }

        await finalizeFromSelectSite(siteRes, roles[0], router);
        return;
    }

    // Multiple sites → user must pick
    await stashPendingToken(response.token);
    const uniqueSites = roles.filter(
        (role, i, arr) => arr.findIndex((r) => r.site_id === role.site_id) === i
    );
    router.replace({
        pathname: '/(auth)/select-site',
        params: { sites: JSON.stringify(uniqueSites) },
    });
};

export const startMfa = routeToOtp;
export { isFirewallBlocked, firewallMessage, finalizeFromSelectSite };
