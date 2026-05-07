import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    ImageBackground,
    StyleSheet,
    Image,
    Switch,
    ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { persistAuth, routePostAuth, clearAuthStorage } from '../utils/authFlow';

export default function OtpScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const { maskedMFA = '' } = useLocalSearchParams();

    const [otp, setOtp] = useState('');
    const [rememberDevice, setRememberDevice] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const inputRef = useRef(null);
    const submittedRef = useRef('');

    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 200);
        return () => clearTimeout(t);
    }, []);

    const submit = async (code) => {
        if (submittedRef.current === code) return;
        submittedRef.current = code;

        try {
            setIsLoading(true);
            setErrorMsg('');

            const token = await AsyncStorage.getItem('pendingToken');
            if (token) api.setToken(token);

            const res = await api.checkOtp(code, rememberDevice);

            if (!res?.verified) {
                setErrorMsg('Invalid code. Please try again.');
                setOtp('');
                submittedRef.current = '';
                return;
            }

            if (res.device_token) {
                await AsyncStorage.setItem('mfaDeviceToken', res.device_token);
            }

            // Site already selected — fully logged in
            if (res.site_selected) {
                await persistAuth({
                    token: res.token,
                    staff: res.staff,
                    roles: res.roles,
                    abilities: res.abilities,
                    organisationId: res.organisation_id,
                    siteId: res.site_id,
                });
                router.replace('/(main)');
                return;
            }

            // Verified but still need to figure out site → reuse login routing logic
            await routePostAuth(res, router);
        } catch (error) {
            console.error('Check OTP error:', error);
            const msg =
                error.body?.errors?.otp?.[0] ||
                error.body?.message ||
                error.message ||
                'Invalid code. Please try again.';
            setErrorMsg(String(msg));
            setOtp('');
            submittedRef.current = '';
        } finally {
            setIsLoading(false);
        }
    };

    const onChangeOtp = (value) => {
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        setOtp(cleaned);
        if (errorMsg) setErrorMsg('');
        if (cleaned.length === 6 && !isLoading) {
            submit(cleaned);
        }
    };

    const cancel = async () => {
        await clearAuthStorage();
        router.replace('/(auth)/login');
    };

    const channelLabel = (() => {
        if (!maskedMFA) return 'your registered device';
        if (maskedMFA === 'totp') return 'your Authenticator app';
        return maskedMFA;
    })();

    const headline =
        maskedMFA === 'totp'
            ? 'Enter the 6-digit code from your Authenticator app.'
            : `We sent a 6-digit code to ${channelLabel}.`;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
        >
            <StatusBar style="light" />
            <ImageBackground
                source={require('../../assets/login-page-client.webp')}
                blurRadius={3}
                style={styles.background}
            >
                <View style={styles.overlay} />
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.card}>
                        <View style={styles.header}>
                            <Image
                                source={require('../../assets/logo_light.png')}
                                style={styles.logo}
                            />
                            <Text style={styles.title}>Two-factor verification</Text>
                            <Text style={styles.subtitle}>{headline}</Text>
                            <Text style={styles.hint}>The code expires in 3 minutes.</Text>
                        </View>

                        <Text style={styles.label}>One-time code</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                ref={inputRef}
                                style={styles.input}
                                value={otp}
                                onChangeText={onChangeOtp}
                                placeholder="123456"
                                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                                keyboardType="number-pad"
                                maxLength={6}
                                editable={!isLoading}
                                autoComplete="one-time-code"
                                textContentType="oneTimeCode"
                            />
                        </View>

                        {errorMsg ? (
                            <Text style={styles.errorText}>{errorMsg}</Text>
                        ) : null}

                        <View style={styles.rememberRow}>
                            <Switch
                                value={rememberDevice}
                                onValueChange={setRememberDevice}
                                disabled={isLoading}
                                trackColor={{ false: 'rgba(255,255,255,0.2)', true: colors.primary }}
                                thumbColor="#ffffff"
                            />
                            <Text style={styles.rememberText}>
                                Remember this device for 3 weeks
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={() => otp.length === 6 && submit(otp)}
                            disabled={otp.length !== 6 || isLoading}
                            style={[
                                styles.submitButton,
                                {
                                    backgroundColor: colors.primary,
                                    opacity: otp.length === 6 && !isLoading ? 1 : 0.5,
                                },
                            ]}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.submitText}>Verify</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={cancel} style={styles.cancelButton}>
                            <Text style={[styles.cancelText, { color: colors.primary }]}>
                                Back to Sign In
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </ImageBackground>
        </KeyboardAvoidingView>
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
    subtitle: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 6, fontSize: 13 },
    hint: { color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 4, fontSize: 12 },
    label: { color: '#ffffff', marginBottom: 6 },
    inputContainer: {
        backgroundColor: '#42454C',
        borderRadius: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    input: {
        color: '#ffffff',
        fontSize: 22,
        letterSpacing: 6,
        textAlign: 'center',
        paddingVertical: 8,
    },
    errorText: { color: '#ff6b6b', marginTop: 8, fontSize: 13 },
    rememberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 16,
    },
    rememberText: { color: '#ffffff', fontSize: 13, flexShrink: 1 },
    submitButton: {
        marginTop: 20,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    submitText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
    cancelButton: { alignSelf: 'center', marginTop: 14 },
    cancelText: { fontWeight: '600' },
});
