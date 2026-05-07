import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Theme from '../context/ThemeContext';
import StaffInfo from '../components/StaffInfo';

function Header() {
    const { useTheme } = Theme;
    const { theme, mode } = useTheme();
    const { colors } = theme;
    return (
        <>
            <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
            <SafeAreaView
                style={{ backgroundColor: colors.background, paddingBottom: 6 }}
                edges={['top']}
            >
                <StaffInfo />
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
                <Tabs.Screen name="classes" options={{ title: 'Classes' }} />
                <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
                {/* Reports stays registered (still navigable) but hidden from the tab bar
                    since the client's spec lists Progress Reports as a sub-feature of
                    Classes, not a top-level item. */}
                <Tabs.Screen name="reports" options={{ title: 'Reports', href: null }} />
            </Tabs>
        </ThemeBackground>
    );
}
