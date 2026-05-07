import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, Image, Modal } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments, useRouter } from 'expo-router';
import Theme from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';

const TABS = [
    { name: 'Dashboard',   route: 'index',      path: '/(main)/' },
    { name: 'Attendance',  route: 'attendance', path: '/(main)/attendance' },
    { name: 'My Roster',   route: 'roster',     path: '/(main)/roster' },
    { name: 'My Timetable', route: 'timetable', path: '/(main)/timetable' },
    { name: 'My Calendar', route: 'calendar',   path: '/(main)/calendar' },
    { name: 'Classes',     route: 'classes',    path: '/(main)/classes' },
    { name: 'Tickets',     route: 'tickets',    path: '/(main)/tickets' },
];

const KNOWN_ROUTES = TABS.map(t => t.route).filter(r => r !== 'index');

export default function StaffInfo() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const segments = useSegments();
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [currentSite, setCurrentSite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const scrollViewRef = useRef(null);
    const tabLayoutsRef = useRef({});
    const scrollViewWidthRef = useRef(0);
    const contentWidthRef = useRef(0);
    const scrollOffsetRef = useRef(0);

    useEffect(() => { loadStaffData(); }, []);

    const loadStaffData = async () => {
        try {
            setLoading(true);
            const [staffJson, siteIdValue, rolesJson] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('siteId'),
                AsyncStorage.getItem('roles'),
            ]);
            try {
                const parsed = staffJson ? JSON.parse(staffJson) : null;
                setStaff(parsed);
                // Backend MeTransformer puts unread message count under `has_unread`.
                if (parsed && typeof parsed.has_unread === 'number') {
                    setUnreadCount(parsed.has_unread);
                }
            } catch { setStaff(null); }
            try {
                const roles = rolesJson ? JSON.parse(rolesJson) : [];
                const match = roles.find((r) => String(r.site_id) === String(siteIdValue));
                if (match) {
                    setCurrentSite({
                        siteName: match.site_name,
                        orgName: match.org_name,
                        roleName: match.role_name,
                    });
                }
            } catch { /* ignore */ }
        } finally {
            setLoading(false);
        }
    };

    const getInitials = () => {
        if (!staff) return '?';
        return ((staff.fname?.[0] || '') + (staff.sname?.[0] || '')).toUpperCase() || '?';
    };

    const lastSegment = segments[segments.length - 1] || '';
    const currentRoute = KNOWN_ROUTES.includes(lastSegment) ? lastSegment : 'index';

    const updateArrows = (offsetX) => {
        const maxOffset = contentWidthRef.current - scrollViewWidthRef.current;
        setShowLeftArrow(offsetX > 4);
        setShowRightArrow(maxOffset > 4 && offsetX < maxOffset - 4);
    };

    const scrollToTab = (route, animated = true) => {
        const layout = tabLayoutsRef.current[route];
        if (!layout || !scrollViewRef.current || scrollViewWidthRef.current === 0) return;
        const targetX = layout.x + layout.width / 2 - scrollViewWidthRef.current / 2;
        scrollViewRef.current.scrollTo({ x: Math.max(0, targetX), animated });
    };

    useEffect(() => {
        const t = setTimeout(() => scrollToTab(currentRoute, true), 80);
        return () => clearTimeout(t);
    }, [currentRoute]);

    const handleTabPress = (tab) => {
        router.push(tab.path);
        scrollToTab(tab.route, true);
    };

    if (loading) {
        return (
            <View style={{
                backgroundColor: colors.background,
                paddingHorizontal: 16,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
            }}>
                <ActivityIndicator size="small" color={colors.primary} />
            </View>
        );
    }

    const fullName = staff ? `${staff.fname || ''} ${staff.sname || ''}`.trim() : '';

    return (
        <View style={{
            backgroundColor: colors.background,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
        }}>

            {/* Avatar with unread badge — opens menu */}
            <TouchableOpacity onPress={() => setIsMenuVisible(true)} style={{ marginRight: 6 }}>
                <View>
                    {staff?.photo ? (
                        <Image source={{ uri: staff.photo }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                    ) : (
                        <View style={{
                            width: 34, height: 34, borderRadius: 17,
                            backgroundColor: colors.primary,
                            justifyContent: 'center', alignItems: 'center',
                        }}>
                            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 'bold' }}>{getInitials()}</Text>
                        </View>
                    )}
                    {unreadCount > 0 && (
                        <View style={{
                            position: 'absolute', top: -4, right: -4,
                            backgroundColor: colors.error,
                            borderRadius: 8,
                            minWidth: 16, height: 16,
                            justifyContent: 'center', alignItems: 'center',
                            paddingHorizontal: 3,
                        }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>

            {/* Scrollable tabs */}
            <View style={{ flex: 1, position: 'relative' }}>
                {showLeftArrow && (
                    <View pointerEvents="none" style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 10,
                        justifyContent: 'center', paddingRight: 6, backgroundColor: colors.background,
                    }}>
                        <Ionicons name="chevron-back" size={14} color={colors.textDisabled} />
                    </View>
                )}
                <ScrollView
                    ref={scrollViewRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 2 }}
                    onLayout={e => { scrollViewWidthRef.current = e.nativeEvent.layout.width; updateArrows(scrollOffsetRef.current); }}
                    onContentSizeChange={w => { contentWidthRef.current = w; updateArrows(scrollOffsetRef.current); }}
                    onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.x; updateArrows(scrollOffsetRef.current); }}
                    scrollEventThrottle={16}
                >
                    {TABS.map(tab => {
                        const isActive = currentRoute === tab.route;
                        return (
                            <TouchableOpacity
                                key={tab.route}
                                onPress={() => handleTabPress(tab)}
                                onLayout={e => {
                                    tabLayoutsRef.current[tab.route] = {
                                        x: e.nativeEvent.layout.x,
                                        width: e.nativeEvent.layout.width,
                                    };
                                }}
                                style={{ paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' }}
                            >
                                <Text style={{
                                    color: isActive ? colors.primary : colors.textSecondary,
                                    fontSize: 14,
                                    fontWeight: isActive ? '600' : '400',
                                }}>
                                    {tab.name}
                                </Text>
                                <View style={{
                                    height: 2, marginTop: 3, borderRadius: 1,
                                    backgroundColor: isActive ? colors.primary : 'transparent',
                                    alignSelf: 'stretch',
                                }} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
                {showRightArrow && (
                    <View pointerEvents="none" style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 10,
                        justifyContent: 'center', paddingLeft: 6, backgroundColor: colors.background,
                    }}>
                        <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
                    </View>
                )}
            </View>

            {/* Avatar menu modal */}
            <Modal visible={isMenuVisible} transparent animationType="fade" onRequestClose={() => setIsMenuVisible(false)}>
                <TouchableOpacity
                    style={{
                        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
                        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
                    }}
                    activeOpacity={1}
                    onPress={() => setIsMenuVisible(false)}
                >
                    <TouchableOpacity activeOpacity={1} style={{ width: '100%', maxWidth: 360 }} onPress={() => {}}>
                        <View style={{
                            backgroundColor: colors.cardBackground,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: colors.border,
                            overflow: 'hidden',
                        }}>

                            {/* Staff header */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', padding: 20,
                                borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12,
                            }}>
                                {staff?.photo ? (
                                    <Image source={{ uri: staff.photo }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                                ) : (
                                    <View style={{
                                        width: 44, height: 44, borderRadius: 22,
                                        backgroundColor: colors.primary,
                                        justifyContent: 'center', alignItems: 'center',
                                    }}>
                                        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>{getInitials()}</Text>
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>
                                        {fullName || 'Staff'}
                                    </Text>
                                    {staff?.email ? (
                                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                                            {staff.email}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>

                            {/* Messages link */}
                            <TouchableOpacity
                                onPress={() => { setIsMenuVisible(false); router.push('/messages'); }}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 12,
                                    paddingHorizontal: 20, paddingVertical: 14,
                                    borderBottomWidth: 1, borderBottomColor: colors.border,
                                }}
                            >
                                <FontAwesome name="envelope-o" size={16} color={colors.primary} />
                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500', flex: 1 }}>
                                    Messages
                                </Text>
                                {unreadCount > 0 && (
                                    <View style={{
                                        backgroundColor: colors.error,
                                        borderRadius: 10,
                                        minWidth: 20, height: 20,
                                        justifyContent: 'center', alignItems: 'center',
                                        paddingHorizontal: 5,
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            {/* Site context */}
                            {currentSite ? (
                                <View style={{
                                    paddingHorizontal: 20, paddingVertical: 14,
                                    borderBottomWidth: 1, borderBottomColor: colors.border,
                                    flexDirection: 'row', alignItems: 'center', gap: 12,
                                }}>
                                    <FontAwesome name="building-o" size={16} color={colors.primary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                                            {currentSite.siteName}
                                        </Text>
                                        {currentSite.orgName ? (
                                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                                {currentSite.orgName}
                                            </Text>
                                        ) : null}
                                        {currentSite.roleName ? (
                                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                                {currentSite.roleName}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            ) : null}

                            {/* Settings body */}
                            <View style={{ padding: 16, gap: 10 }}>
                                <ThemeToggle />
                                <LogoutButton />
                            </View>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}
