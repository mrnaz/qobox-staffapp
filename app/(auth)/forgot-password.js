import React, { useState } from 'react';
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
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { authTheme } from '../constants/authTheme';

export default function ForgotPasswordScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const validate = () => {
        const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
        const staffRefRegex = /^[a-zA-Z0-9\s\-_]+$/;

        if (!email) {
            Alert.alert('Validation', 'Email or Staff ID is required');
            return false;
        }
        if (!emailRegex.test(email) && !staffRefRegex.test(email)) {
            Alert.alert('Validation', 'Please enter a valid email or Staff ID');
            return false;
        }
        return true;
    };

    const handleRequestReset = async () => {
        if (!validate()) return;
        try {
            setIsLoading(true);
            await api.forgotPassword(email);
            setSuccess(true);
        } catch (error) {
            console.error('Forgot password error:', error);
            Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const navigateBackToLogin = () => {
        router.replace('/(auth)/login');
    };

    const backgroundImage = require('../../assets/login-page-client.webp');

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
                        <View className="items-center mb-6">
                            <Image
                                source={require('../../assets/logo_light.png')}
                                style={styles.logo}
                            />
                            <Text style={{ color: authTheme.text }} className="text-center mt-2">
                                Reset your password
                            </Text>
                        </View>

                        {success && (
                            <View
                                style={{
                                    backgroundColor: authTheme.successBg,
                                    borderColor: authTheme.successBorder,
                                }}
                                className="border rounded-md py-2 px-3 mb-4"
                            >
                                <Text style={{ color: authTheme.success }} className="text-xs font-medium text-center">
                                    Password reset link is sent to your email.
                                </Text>
                            </View>
                        )}

                        <View className="mb-4">
                            <Text style={{ color: authTheme.text }} className="mb-1">Email or Staff ID</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.textInput}
                                    className="text-lg"
                                    placeholder="staff@email.com or Staff ID"
                                    placeholderTextColor={authTheme.textMuted60}
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <TouchableOpacity
                                onPress={handleRequestReset}
                                disabled={isLoading}
                                style={{ backgroundColor: colors.primary, opacity: isLoading ? 0.7 : 1 }}
                                className="py-4 rounded-lg items-center mt-2"
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={authTheme.text} />
                                ) : (
                                    <Text style={{ color: authTheme.text }} className="font-bold text-lg">Reset Password</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity onPress={navigateBackToLogin} className="self-center mt-6">
                                <Text style={{ color: colors.primary }} className="font-semibold">Back to Sign In</Text>
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
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: authTheme.overlay,
    },
    authCard: {
        width: '100%',
        maxWidth: 460,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: authTheme.cardBorder,
        backgroundColor: authTheme.cardBackground,
        overflow: 'hidden',
        shadowColor: authTheme.cardShadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 12,
    },
    inputContainer: {
        backgroundColor: authTheme.inputBackground,
        borderRadius: 8,
        padding: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: authTheme.cardBorder,
    },
    textInput: {
        color: authTheme.text,
        minHeight: 24,
        paddingVertical: 8,
        textAlignVertical: 'center',
    },
    logo: {
        width: 160,
        height: 40,
        resizeMode: 'contain',
    },
});
