import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { routePostAuth, startMfa, clearAuthStorage } from '../utils/authFlow';

const LAST_EMAIL_KEY = 'lastLoginEmail';

export default function LoginScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const router = useRouter();

    useEffect(() => {
        AsyncStorage.getItem(LAST_EMAIL_KEY)
            .then((saved) => { if (saved) setEmail(saved); })
            .catch(() => {});
    }, []);

    const validate = () => {
        const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;

        if (!email) {
            Alert.alert('Validation', 'Email is required');
            return false;
        }
        if (!emailRegex.test(email)) {
            Alert.alert('Validation', 'Please enter a valid email address');
            return false;
        }
        if (!password) {
            Alert.alert('Validation', 'Password is required');
            return false;
        }
        return true;
    };

    const handleLogin = async () => {
        if (!validate()) return;

        try {
            setIsLoading(true);
            await clearAuthStorage();
            const normalisedEmail = email.toLowerCase().trim();
            const response = await api.login({ email: normalisedEmail, password });

            if (response?.otpToken) {
                try { await AsyncStorage.setItem(LAST_EMAIL_KEY, normalisedEmail); } catch {}
                await startMfa(response.otpToken, response.maskedMFA, router);
                return;
            }

            if (!response?.token) {
                Alert.alert('Login Failed', 'Unexpected response from server.');
                return;
            }

            try { await AsyncStorage.setItem(LAST_EMAIL_KEY, normalisedEmail); } catch {}
            await routePostAuth(response, router);
        } catch (error) {
            console.error('Login error:', error);
            if (error.firewall_blocked) {
                Alert.alert('Access Denied', error.message);
                return;
            }
            const msg =
                error.body?.errors?.login ||
                error.body?.errors?.email?.[0] ||
                error.body?.errors?.password?.[0] ||
                error.body?.message ||
                error.message ||
                'Please check your credentials and try again';
            Alert.alert('Login Failed', String(msg));
        } finally {
            setIsLoading(false);
        }
    };

    const navigateToForgotPassword = () => {
        router.push('/(auth)/forgot-password');
    };

    const backgroundImage = require('../../assets/login-page-bg.webp');

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
        >
            <StatusBar style="light" />
            <ImageBackground
                source={backgroundImage}
                blurRadius={3}
                style={styles.backgroundImage}
                imageStyle={styles.backgroundImageStyle}
            >
                <View style={styles.overlay} />

                <View className="flex-1 justify-center items-center px-6">
                    <View style={styles.authCard}>
                        <View className="items-center mb-8">
                            <Image
                                source={require('../../assets/logo_light.png')}
                                style={styles.logo}
                            />
                            <Text style={{ color: '#ffffff' }} className="text-center mt-2">
                                Sign in to your staff account
                            </Text>
                        </View>

                        <View className="mb-4">
                            <Text style={{ color: '#ffffff' }} className="mb-1">Email</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.textInput}
                                    className="text-lg"
                                    placeholder="staff@email.com"
                                    placeholderTextColor="rgba(255, 255, 255, 0.6)"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <Text style={{ color: '#ffffff' }} className="mb-1 mt-4">Password</Text>
                            <View style={styles.inputContainer}>
                                <View style={styles.passwordInputWrapper}>
                                    <TextInput
                                        style={styles.passwordInput}
                                        className="text-lg"
                                        placeholder="Password"
                                        placeholderTextColor="rgba(255, 255, 255, 0.6)"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setShowPassword(!showPassword)}
                                        style={styles.eyeIcon}
                                    >
                                        <Ionicons
                                            name={showPassword ? 'eye-off' : 'eye'}
                                            size={20}
                                            color="rgba(255, 255, 255, 0.7)"
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={navigateToForgotPassword}
                                className="self-end mb-4"
                            >
                                <Text style={{ color: '#ffffff' }} className="text-right">Forgot Password?</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleLogin}
                                disabled={isLoading}
                                style={{ backgroundColor: colors.primary, opacity: isLoading ? 0.7 : 1 }}
                                className="py-4 rounded-lg items-center mt-4"
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#ffffff" />
                                ) : (
                                    <Text style={{ color: '#ffffff' }} className="font-bold text-lg">Sign In</Text>
                                )}
                            </TouchableOpacity>

                        </View>
                    </View>
                </View>
            </ImageBackground>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    backgroundImageStyle: {
        opacity: 0.9,
    },
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    authCard: {
        width: '100%',
        maxWidth: 460,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(20, 20, 20, 0.6)',
        overflow: 'hidden',
    },
    logo: {
        width: 160,
        height: 40,
        resizeMode: 'contain',
    },
    inputContainer: {
        backgroundColor: '#42454C',
        borderRadius: 8,
        padding: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    textInput: {
        color: '#ffffff',
        minHeight: 24,
        paddingVertical: 8,
        textAlignVertical: 'center',
    },
    passwordInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    passwordInput: {
        color: '#ffffff',
        minHeight: 24,
        paddingVertical: 8,
        textAlignVertical: 'center',
        flex: 1,
    },
    eyeIcon: {
        padding: 4,
        marginLeft: 8,
    },
    registerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 18,
    },
});
