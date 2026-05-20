import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Image, Modal } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments, useRouter } from 'expo-router';
import Theme from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';

const JUMP_TABS = [
    { name: 'Dashboard',    route: 'index',      path: '/(main)/',           icon: 'home' },
    { name: 'Attendance',   route: 'attendance', path: '/(main)/attendance', icon: 'check-square-o' },
    { name: 'My Roster',    route: 'roster',     path: '/(main)/roster',     icon: 'calendar-check-o' },
    { name: 'My Timetable', route: 'timetable',  path: '/(main)/timetable',  icon: 'clock-o' },
    { name: 'My Calendar',  route: 'calendar',   path: '/(main)/calendar',   icon: 'calendar' },
    { name: 'My Classes',   route: 'classes',    path: '/(main)/classes',    icon: 'graduation-cap' },
    { name: 'My Students',  route: 'students',   path: '/(main)/students',   icon: 'users' },
    { name: 'Reports',      route: 'progress-reports', path: '/(main)/progress-reports', icon: 'file-text-o' },
    { name: 'My Tickets',   route: 'tickets',    path: '/(main)/tickets',    icon: 'ticket' },
];

const KNOWN_ROUTES = JUMP_TABS.map(t => t.route).filter(r => r !== 'index');

export default function StaffInfo() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const segments = useSegments();
    const router = useRouter();

    const isMessagesTab = segments.includes('messages');

    const [staff, setStaff] = useState(null);
    const [currentSite, setCurrentSite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [isJumpVisible, setIsJumpVisible] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

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

    const handleTabPress = (tab) => {
        router.push(tab.path);
    };

    if (isMessagesTab) return null;

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
            paddingVertical: 8,
            gap: 10,
        }}>

            {/* Jump to button */}
            <TouchableOpacity
                onPress={() => setIsJumpVisible(true)}
                style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: colors.border,
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                <FontAwesome name="th" size={15} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Avatar — opens menu */}
            <TouchableOpacity onPress={() => setIsMenuVisible(true)} style={{ width: 36, height: 36 }}>
                <View>
                    {staff?.photo ? (
                        <Image source={{ uri: staff.photo }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                        <View style={{
                            width: 36, height: 36, borderRadius: 18,
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

            {/* Staff name + site name */}
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                    {fullName || 'Staff'}
                </Text>
                {currentSite?.siteName ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                        {currentSite.siteName}
                    </Text>
                ) : null}
            </View>

            {/* Jump To modal */}
            <Modal visible={isJumpVisible} transparent animationType="slide" onRequestClose={() => setIsJumpVisible(false)}>
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
                    activeOpacity={1}
                    onPress={() => setIsJumpVisible(false)}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                        <View style={{
                            backgroundColor: colors.cardBackground,
                            borderTopLeftRadius: 20, borderTopRightRadius: 20,
                            borderTopWidth: 1, borderColor: colors.border,
                            paddingBottom: 28,
                        }}>
                            {/* Handle + title */}
                            <View style={{
                                alignItems: 'center', paddingTop: 12, paddingBottom: 16,
                                borderBottomWidth: 1, borderBottomColor: colors.border,
                            }}>
                                <View style={{
                                    width: 36, height: 4, borderRadius: 2,
                                    backgroundColor: colors.border, marginBottom: 12,
                                }} />
                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>Jump to</Text>
                            </View>

                            {/* 3-column grid */}
                            <View style={{
                                flexDirection: 'row', flexWrap: 'wrap',
                                justifyContent: 'center',
                                paddingHorizontal: 16, paddingTop: 16, gap: 12,
                            }}>
                                {JUMP_TABS.map(tab => {
                                    const isActive = currentRoute === tab.route;
                                    return (
                                        <TouchableOpacity
                                            key={tab.route}
                                            onPress={() => { setIsJumpVisible(false); handleTabPress(tab); }}
                                            style={{
                                                width: '30%',
                                                paddingVertical: 16,
                                                borderRadius: 16,
                                                backgroundColor: isActive ? colors.primary + '18' : colors.surface,
                                                borderWidth: 1,
                                                borderColor: isActive ? colors.primary : colors.border,
                                                alignItems: 'center',
                                            }}
                                        >
                                            <View style={{
                                                width: 40, height: 40, borderRadius: 20,
                                                backgroundColor: isActive ? colors.primary : colors.primary + '18',
                                                alignItems: 'center', justifyContent: 'center',
                                                marginBottom: 6,
                                            }}>
                                                <FontAwesome name={tab.icon} size={18} color={isActive ? '#fff' : colors.primary} />
                                            </View>
                                            <Text style={{
                                                color: isActive ? colors.primary : colors.textPrimary,
                                                fontSize: 12,
                                                fontWeight: isActive ? '700' : '500',
                                                textAlign: 'center',
                                            }}>
                                                {tab.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Avatar menu modal — centered */}
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
                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>
                                    Messages
                                </Text>
                                {unreadCount > 0 && (
                                    <View style={{
                                        backgroundColor: colors.error,
                                        borderRadius: 10,
                                        minWidth: 20, height: 20,
                                        justifyContent: 'center', alignItems: 'center',
                                        paddingHorizontal: 5, marginLeft: 6,
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </Text>
                                    </View>
                                )}
                                <View style={{ flex: 1 }} />
                                <FontAwesome name="chevron-right" size={12} color={colors.textDisabled} />
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
                            <View style={{ padding: 16, flexDirection: 'row', gap: 10 }}>
                                <View style={{ flex: 1 }}><ThemeToggle /></View>
                                <View style={{ flex: 1 }}><LogoutButton /></View>
                            </View>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}
