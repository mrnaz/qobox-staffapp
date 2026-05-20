import { Tabs, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Theme from '../context/ThemeContext';
import StaffInfo from '../components/StaffInfo';

const PAGE_TITLES = {
    index: 'Dashboard',
    attendance: 'Attendance',
    roster: 'My Roster',
    timetable: 'My Timetable',
    calendar: 'My Calendar',
    classes: 'My Classes',
    students: 'My Students',
    'progress-reports': 'Reports',
    tickets: 'My Tickets',
    reports: 'Reports',
};

function PageTitle() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const segments = useSegments();
    const [fname, setFname] = useState('');

    const last = segments[segments.length - 1] || '';
    const route = PAGE_TITLES[last] ? last : 'index';

    useEffect(() => {
        if (route !== 'index') return;
        (async () => {
            try {
                const s = await AsyncStorage.getItem('staff');
                const parsed = s ? JSON.parse(s) : null;
                setFname(parsed?.fname || '');
            } catch { /* ignore */ }
        })();
    }, [route]);

    let title = PAGE_TITLES[route];
    if (route === 'index') {
        const h = new Date().getHours();
        const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        title = `${greet}, ${fname || 'Staff'}`;
    }

    return (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.background }}>
            <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700' }} numberOfLines={1}>
                {title}
            </Text>
        </View>
    );
}

function Header() {
    const { useTheme } = Theme;
    const { theme, mode } = useTheme();
    const { colors } = theme;
    return (
        <>
            <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
            <SafeAreaView
                style={{ backgroundColor: colors.background }}
                edges={['top']}
            >
                <StaffInfo />
                <PageTitle />
            </SafeAreaView>
        </>
    );
}

function ThemeBackground({ children }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            edges={['bottom']}
        >
            {children}
        </SafeAreaView>
    );
}

export default function MainLayout() {
    const renderTabBar = useCallback(() => null, []);
    const renderHeader = useCallback(() => <Header />, []);
    const screenOptions = useMemo(
        () => ({ header: renderHeader, headerShown: true }),
        [renderHeader]
    );

    return (
        <ThemeBackground>
            <Tabs tabBar={renderTabBar} screenOptions={screenOptions}>
                <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
                <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
                <Tabs.Screen name="roster" options={{ title: 'My Roster' }} />
                <Tabs.Screen name="timetable" options={{ title: 'My Timetable' }} />
                <Tabs.Screen name="calendar" options={{ title: 'My Calendar' }} />
                <Tabs.Screen name="classes" options={{ title: 'My Classes' }} />
                <Tabs.Screen name="students" options={{ title: 'My Students' }} />
                <Tabs.Screen name="progress-reports" options={{ title: 'Reports' }} />
                <Tabs.Screen name="tickets" options={{ title: 'My Tickets' }} />
                {/* Reports stays registered (still navigable) but hidden from the tab bar
                    since the client's spec lists Progress Reports as a sub-feature of
                    Classes, not a top-level item. */}
                <Tabs.Screen name="reports" options={{ title: 'Reports', href: null }} />
            </Tabs>
        </ThemeBackground>
    );
}
