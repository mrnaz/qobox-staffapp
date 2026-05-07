import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    StyleSheet,
    ScrollView,
    ImageBackground,
    Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function SelectSiteScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const params = useLocalSearchParams();

    const sites = (() => {
        try { return JSON.parse(params.sites || '[]'); } catch { return []; }
    })();

    const [selectingId, setSelectingId] = useState(null);

    const handleSelect = async (role) => {
        try {
            setSelectingId(role.site_id);
            const token = await AsyncStorage.getItem('pendingToken');
            if (token) api.setToken(token);

            let siteRes;
            try {
                siteRes = await api.selectSite(role.site_id);
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
                organisationId: role.org_id,
                siteId: role.site_id,
            });
            router.replace('/(main)');
        } catch (error) {
            console.error('Select site error', error);
            Alert.alert(
                'Failed',
                error.body?.message || error.message || 'Could not select site. Please try again.'
            );
        } finally {
            setSelectingId(null);
        }
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
                        <Image
                            source={require('../../assets/logo_light.png')}
                            style={styles.logo}
                        />
                        <Text style={styles.title}>Select a site</Text>
                        <Text style={styles.subtitle}>You have access to multiple sites. Pick one to continue.</Text>
                    </View>

                    {sites.length === 0 && (
                        <Text style={styles.empty}>No sites available.</Text>
                    )}

                    {sites.map((role) => (
                        <TouchableOpacity
                            key={role.site_id}
                            style={[styles.siteRow, { borderColor: colors.primary }]}
                            disabled={selectingId !== null}
                            onPress={() => handleSelect(role)}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={styles.siteName}>{role.site_name || `Site #${role.site_id}`}</Text>
                                <Text style={styles.orgName}>{role.org_name || ''}</Text>
                                {role.role_name ? <Text style={styles.roleName}>{role.role_name}</Text> : null}
                            </View>
                            {selectingId === role.site_id ? (
                                <ActivityIndicator color={colors.primary} />
                            ) : (
                                <Text style={[styles.chevron, { color: colors.primary }]}>›</Text>
                            )}
                        </TouchableOpacity>
                    ))}

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
    header: { alignItems: 'center', marginBottom: 20 },
    logo: { width: 160, height: 40, resizeMode: 'contain', marginBottom: 12 },
    title: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
    subtitle: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 4, fontSize: 13 },
    empty: { color: '#ffffff', textAlign: 'center', paddingVertical: 16 },
    siteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#42454C',
        borderRadius: 8,
        borderWidth: 1,
        padding: 14,
        marginBottom: 10,
    },
    siteName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    orgName: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
    roleName: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
    chevron: { fontSize: 24, fontWeight: '300', marginLeft: 8 },
    cancelButton: { alignSelf: 'center', marginTop: 16 },
    cancelText: { fontWeight: '600' },
});
