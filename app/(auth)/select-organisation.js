import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    StyleSheet,
    ScrollView,
    ImageBackground,
    Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import {
    persistAuth,
    startMfa,
    clearAuthStorage,
    isFirewallBlocked,
    firewallMessage,
} from '../utils/authFlow';

// Organisation picker for sysadmins, mirroring the web's admin mode
// (resources/js/_staff/views/pages/system/organisations): a sysadmin logs in
// with no roles and therefore no site, so nothing in the app has a scope until
// they choose one. Selecting a site here runs the same /select-site exchange
// every other user goes through, which is what mints the site-scoped token the
// rest of the API expects.
//
// GET system/organisations already nests each organisation's sites, so the
// whole screen needs one request.
export default function SelectOrganisationScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [orgs, setOrgs] = useState([]);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [selectingId, setSelectingId] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setSearch(query.trim()), 400);
        return () => clearTimeout(t);
    }, [query]);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError('');
            // The pending (pre-site) token is what authorises this list.
            const token = await AsyncStorage.getItem('pendingToken')
                || await AsyncStorage.getItem('accessToken');
            if (token) api.setToken(token);

            const res = await api.getSystemOrganisations({
                paginate: 100,
                page: 1,
                ...(search ? { search } : {}),
            });
            const list = res?.organisations || res?.data || [];
            setOrgs(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Organisations load error', err);
            setError(err.body?.message || err.message || 'Could not load organisations.');
        } finally {
            setIsLoading(false);
        }
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const enterSite = async (site) => {
        try {
            setSelectingId(site.id);
            const token = await AsyncStorage.getItem('pendingToken')
                || await AsyncStorage.getItem('accessToken');
            if (token) api.setToken(token);

            let siteRes;
            try {
                siteRes = await api.selectSite(site.id);
            } catch (err) {
                if (isFirewallBlocked(err)) {
                    Alert.alert('Access Denied', firewallMessage(err));
                    return;
                }
                throw err;
            }

            if (siteRes?.mfa_required) {
                await startMfa(siteRes.otpToken, siteRes.maskedMFA, router);
                return;
            }

            await persistAuth({
                token: siteRes.token,
                staff: siteRes.staff,
                roles: siteRes.roles,
                abilities: siteRes.abilities,
                organisationId: site.organisation_id,
                siteId: site.id,
            });
            router.replace('/(main)');
        } catch (err) {
            console.error('Select site error', err);
            Alert.alert(
                'Failed',
                err.body?.message || err.message || 'Could not open that site. Please try again.'
            );
        } finally {
            setSelectingId(null);
        }
    };

    const onOrgPress = (org) => {
        const sites = org.sites || [];
        // One site means the organisation *is* the choice — the same shortcut
        // authFlow takes when a user's roles all share a site.
        if (sites.length === 1) {
            enterSite(sites[0]);
            return;
        }
        setExpandedId(expandedId === org.id ? null : org.id);
    };

    const cancel = async () => {
        await clearAuthStorage();
        router.replace('/(auth)/login');
    };

    return (
        <ImageBackground
            source={require('../../assets/login-page-client.webp')}
            blurRadius={3}
            style={styles.background}
        >
            <StatusBar style="light" />
            <View style={styles.overlay} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Image source={require('../../assets/logo_light.png')} style={styles.logo} />
                        <Text style={styles.title}>Choose an organisation</Text>
                        <Text style={styles.subtitle}>
                            You are signed in as a system administrator. Pick where you want to work.
                        </Text>
                    </View>

                    <View style={styles.searchWrap}>
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search organisations…"
                            placeholderTextColor="rgba(255,255,255,0.45)"
                            style={styles.searchInput}
                            autoCorrect={false}
                        />
                        {query ? (
                            <TouchableOpacity onPress={() => setQuery('')}>
                                <Text style={styles.clear}>✕</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    {isLoading && orgs.length === 0 ? (
                        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
                    ) : error ? (
                        <>
                            <Text style={styles.empty}>{error}</Text>
                            <TouchableOpacity onPress={load} style={styles.retry}>
                                <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
                            </TouchableOpacity>
                        </>
                    ) : orgs.length === 0 ? (
                        <Text style={styles.empty}>
                            {search ? 'No organisation matches that search.' : 'No organisations available.'}
                        </Text>
                    ) : (
                        orgs.map((org) => {
                            const sites = org.sites || [];
                            const open = expandedId === org.id;
                            const busy = sites.some((s) => s.id === selectingId);
                            return (
                                <View key={org.id} style={styles.orgBlock}>
                                    <TouchableOpacity
                                        style={[styles.orgRow, { borderColor: colors.primary }]}
                                        disabled={selectingId !== null}
                                        onPress={() => onOrgPress(org)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.orgName} numberOfLines={2}>
                                                {org.name || `Organisation #${org.id}`}
                                            </Text>
                                            <Text style={styles.orgMeta}>
                                                {sites.length || org.sites_number || 0} site
                                                {(sites.length || org.sites_number || 0) === 1 ? '' : 's'}
                                                {org.staff_number ? ` · ${org.staff_number} staff` : ''}
                                                {org.status && org.status !== 'active' ? ` · ${org.status}` : ''}
                                            </Text>
                                        </View>
                                        {busy ? (
                                            <ActivityIndicator color={colors.primary} />
                                        ) : (
                                            <Text style={[styles.chevron, { color: colors.primary }]}>
                                                {sites.length === 1 ? '›' : open ? '⌃' : '⌄'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>

                                    {open && sites.length > 1 ? (
                                        <View style={styles.siteList}>
                                            {sites.map((site) => (
                                                <TouchableOpacity
                                                    key={site.id}
                                                    style={styles.siteRow}
                                                    disabled={selectingId !== null}
                                                    onPress={() => enterSite(site)}
                                                >
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.siteName} numberOfLines={1}>
                                                            {site.name || `Site #${site.id}`}
                                                        </Text>
                                                        {site.suburbcity || site.timezone ? (
                                                            <Text style={styles.siteMeta} numberOfLines={1}>
                                                                {[site.suburbcity, site.timezone].filter(Boolean).join(' · ')}
                                                            </Text>
                                                        ) : null}
                                                    </View>
                                                    {selectingId === site.id ? (
                                                        <ActivityIndicator color={colors.primary} />
                                                    ) : (
                                                        <Text style={[styles.chevron, { color: colors.primary }]}>›</Text>
                                                    )}
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })
                    )}

                    <TouchableOpacity onPress={cancel} style={styles.cancelButton}>
                        <Text style={[styles.cancelText, { color: colors.primary }]}>Back to Sign In</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1, width: '100%', height: '100%' },
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: {
        width: '100%',
        maxWidth: 460,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(20, 20, 20, 0.6)',
    },
    header: { alignItems: 'center', marginBottom: 16 },
    logo: { width: 160, height: 40, resizeMode: 'contain', marginBottom: 12 },
    title: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
    subtitle: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 4, fontSize: 13 },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#42454C',
        borderRadius: 8,
        paddingHorizontal: 12,
        marginBottom: 12,
    },
    searchInput: { flex: 1, color: '#ffffff', paddingVertical: 10, fontSize: 14 },
    clear: { color: 'rgba(255,255,255,0.6)', fontSize: 14, paddingHorizontal: 4 },
    empty: { color: '#ffffff', textAlign: 'center', paddingVertical: 16 },
    retry: { alignSelf: 'center', paddingVertical: 8 },
    retryText: { fontWeight: '600' },
    orgBlock: { marginBottom: 10 },
    orgRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#42454C',
        borderRadius: 8,
        borderWidth: 1,
        padding: 14,
    },
    orgName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    orgMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
    siteList: { paddingLeft: 12, paddingTop: 8, gap: 8 },
    siteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(66, 69, 76, 0.65)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    siteName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
    siteMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
    chevron: { fontSize: 22, fontWeight: '300', marginLeft: 8 },
    cancelButton: { alignSelf: 'center', marginTop: 12 },
    cancelText: { fontWeight: '600' },
});
