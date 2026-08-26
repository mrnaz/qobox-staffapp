import { Tabs, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';
import StaffInfo from '../components/StaffInfo';

// Title + icon per route. The icons are the same ones the "Jump to" grid uses
// for each tab, so the glyph at the top of a page matches the one you tapped
// to get there. Plain textPrimary, matching the client app's PageTitle.
const PAGE_TITLES = {
    index: { label: 'Dashboard', icon: 'home' },
    attendance: { label: 'Attendance', icon: 'check-square-o' },
    roster: { label: 'Roster', icon: 'calendar-check-o' },
    timetable: { label: 'Timetable', icon: 'clock-o' },
    calendar: { label: 'Calendar', icon: 'calendar' },
    classes: { label: 'Classes', icon: 'graduation-cap' },
    students: { label: 'Students', icon: 'users' },
    'progress-reports': { label: 'Reports', icon: 'file-text-o' },
    tickets: { label: 'Tickets', icon: 'ticket' },
    albums: { label: 'Albums', icon: 'photo' },
    reports: { label: 'Reports', icon: 'file-text-o' },
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

    const { label, icon } = PAGE_TITLES[route];
    let title = label;
    if (route === 'index') {
        const h = new Date().getHours();
        const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        title = `${greet}, ${fname || 'Staff'}`;
    }

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 8,
            backgroundColor: colors.background,
        }}>
            <FontAwesome name={icon} size={18} color={colors.textPrimary} />
            <Text
                style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', flex: 1 }}
                numberOfLines={1}
            >
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
            {/* The status-bar strip belongs to the white header band below it,
                so it takes the surface colour rather than the page background —
                matching the client app's header. */}
            <SafeAreaView
                style={{ backgroundColor: colors.surface }}
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
                <Tabs.Screen name="roster" options={{ title: 'Roster' }} />
                <Tabs.Screen name="timetable" options={{ title: 'Timetable' }} />
                <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
                <Tabs.Screen name="classes" options={{ title: 'Classes' }} />
                <Tabs.Screen name="students" options={{ title: 'Students' }} />
                <Tabs.Screen name="progress-reports" options={{ title: 'Reports' }} />
                <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
                <Tabs.Screen name="albums" options={{ title: 'Albums' }} />
                {/* Reports stays registered (still navigable) but hidden from the tab bar
                    since the client's spec lists Progress Reports as a sub-feature of
                    Classes, not a top-level item. */}
                <Tabs.Screen name="reports" options={{ title: 'Reports', href: null }} />
            </Tabs>
        </ThemeBackground>
    );
}
