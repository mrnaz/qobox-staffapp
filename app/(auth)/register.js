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
    ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { authTheme } from '../constants/authTheme';

export default function RegisterScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [fname, setFname] = useState('');
    const [sname, setSname] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const validate = () => {
        const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
        if (!fname.trim()) {
            Alert.alert('Validation', 'First name is required');
            return false;
        }
        if (!sname.trim()) {
            Alert.alert('Validation', 'Last name is required');
            return false;
        }
        if (!email || !emailRegex.test(email)) {
            Alert.alert('Validation', 'Please enter a valid email');
            return false;
        }
        if (!password || password.length < 8) {
            Alert.alert('Validation', 'Password must be at least 8 characters');
            return false;
        }
        if (password !== confirmPassword) {
            Alert.alert('Validation', 'Passwords do not match');
            return false;
        }
        return true;
    };

    const handleRegister = async () => {
        if (!validate()) return;
        try {
            setIsLoading(true);
            const response = await api.register({
                fname,
                sname,
                email,
                password,
                password_confirmation: confirmPassword,
            });
            if (response?.token) {
                await AsyncStorage.setItem('authToken', response.token);
                await AsyncStorage.setItem('accessToken', response.token);
                router.replace('/(main)');
                return;
            }
            Alert.alert('Success', 'Registration completed. Please sign in.');
            router.replace('/(auth)/login');
        } catch (error) {
            console.error('Register error:', error);
            Alert.alert('Registration Failed', error.message || 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
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

                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.authCard}>
                        <View className="items-center mb-6">
                            <Image
                                source={require('../../assets/logo_light.png')}
                                style={styles.logo}
                            />
                            <Text style={{ color: authTheme.text }} className="text-center mt-2">
                                Create your staff account
                            </Text>
                        </View>

                        <View className="mb-4">
                            <Text style={{ color: authTheme.text }} className="mb-1">First Name</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.textInput}
                                    className="text-lg"
                                    placeholder="John"
                                    placeholderTextColor={authTheme.textMuted60}
                                    value={fname}
                                    onChangeText={setFname}
                                    autoCapitalize="words"
                                />
                            </View>

                            <Text style={{ color: authTheme.text }} className="mb-1">Last Name</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.textInput}
                                    className="text-lg"
                                    placeholder="Doe"
                                    placeholderTextColor={authTheme.textMuted60}
                                    value={sname}
                                    onChangeText={setSname}
                                    autoCapitalize="words"
                                />
                            </View>

                            <Text style={{ color: authTheme.text }} className="mb-1">Email</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.textInput}
                                    className="text-lg"
                                    placeholder="staff@email.com"
                                    placeholderTextColor={authTheme.textMuted60}
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <Text style={{ color: authTheme.text }} className="mb-1">Password</Text>
                            <View style={styles.inputContainer}>
                                <View style={styles.passwordInputWrapper}>
                                    <TextInput
                                        style={styles.passwordInput}
                                        className="text-lg"
                                        placeholder="At least 8 characters"
                                        placeholderTextColor={authTheme.textMuted60}
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
                                            color={authTheme.textMuted70}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <Text style={{ color: authTheme.text }} className="mb-1">Confirm Password</Text>
                            <View style={styles.inputContainer}>
                                <View style={styles.passwordInputWrapper}>
                                    <TextInput
                                        style={styles.passwordInput}
                                        className="text-lg"
                                        placeholder="Repeat password"
                                        placeholderTextColor={authTheme.textMuted60}
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry={!showConfirmPassword}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                        style={styles.eyeIcon}
                                    >
                                        <Ionicons
                                            name={showConfirmPassword ? 'eye-off' : 'eye'}
                                            size={20}
                                            color={authTheme.textMuted70}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={handleRegister}
                                disabled={isLoading}
                                style={{ backgroundColor: colors.primary, opacity: isLoading ? 0.7 : 1 }}
                                className="py-4 rounded-lg items-center mt-2"
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={authTheme.text} />
                                ) : (
                                    <Text style={{ color: authTheme.text }} className="font-bold text-lg">Create Account</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="self-center mt-6">
                                <Text style={{ color: colors.primary }} className="font-semibold">Back to Sign In</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
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
    },
    logo: {
        width: 160,
        height: 40,
        resizeMode: 'contain',
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
    passwordInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    passwordInput: {
        color: authTheme.text,
        minHeight: 24,
        paddingVertical: 8,
        textAlignVertical: 'center',
        flex: 1,
    },
    eyeIcon: {
        padding: 4,
        marginLeft: 8,
    },
});
