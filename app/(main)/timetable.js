import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Modal,
    Dimensions,
    PanResponder,
    Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';

// ---- date helpers ----------------------------------------------------------
const startOfWeek = (date) => {
    const d = new Date(date);
    const dow = d.getDay();
    const diff = (dow + 6) % 7; // Mon = 0
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
};
const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
};
const fmtApi = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// ---- constants -------------------------------------------------------------
const HOUR_HEIGHT = 64;            // visual height per hour
const HOUR_AXIS_WIDTH = 56;
const DEFAULT_DAY_START = 8;       // 8 AM
const DEFAULT_DAY_END = 18;        // 6 PM
// Theme color groups to cycle through for class blocks
const PALETTE = ['azure', 'teal', 'turquoise', 'emerald', 'amber', 'rose', 'indigo', 'cyan', 'lime', 'tangerine'];

// Stable color from a string (class id or title) so the same class always
// gets the same color across renders.
const colorKey = (s) => {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// ---- screen ----------------------------------------------------------------
export default function TimetableScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
    const [selectedDay, setSelectedDay] = useState(new Date());
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [picked, setPicked] = useState(null);

    // ---- swipe between days (pan on the grid) -----------------------------
    const slideX = useRef(new Animated.Value(0)).current;
    const isAnimating = useRef(false);

    const goToDay = useCallback(
        (newDay) => {
            if (isAnimating.current) return;
            const nextWeek = startOfWeek(newDay);
            if (nextWeek.getTime() !== weekStart.getTime()) setWeekStart(nextWeek);
            setSelectedDay(newDay);
        },
        [weekStart]
    );

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponder: (_, g) =>
                    Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
                onPanResponderMove: (_, g) => {
                    slideX.setValue(g.dx);
                },
                onPanResponderRelease: (_, g) => {
                    const threshold = SCREEN_WIDTH / 4;
                    if (g.dx > threshold) {
                        // swipe right → previous day
                        isAnimating.current = true;
                        Animated.timing(slideX, { toValue: SCREEN_WIDTH, duration: 150, useNativeDriver: true }).start(() => {
                            slideX.setValue(0);
                            isAnimating.current = false;
                            goToDay(addDays(selectedDay, -1));
                        });
                    } else if (g.dx < -threshold) {
                        // swipe left → next day
                        isAnimating.current = true;
                        Animated.timing(slideX, { toValue: -SCREEN_WIDTH, duration: 150, useNativeDriver: true }).start(() => {
                            slideX.setValue(0);
                            isAnimating.current = false;
                            goToDay(addDays(selectedDay, 1));
                        });
                    } else {
                        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
                    }
                },
            }),
        [selectedDay, goToDay, slideX]
    );

    // ---- profile + fetch --------------------------------------------------
    useEffect(() => {
        (async () => {
            const s = await AsyncStorage.getItem('staff');
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setProfileLoaded(true);
        })();
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            if (!staff?.id) return;
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const start = fmtApi(weekStart);
                const end = fmtApi(addDays(weekStart, 6));
                const res = await api.getStaffTimetable(staff.id, { start_date: start, end_date: end });
                const data = res?.timetable || res?.data || res || [];
                setItems(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Timetable load error', err);
                setError(err.body?.message || err.message || 'Failed to load timetable.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [staff, weekStart]
    );

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    // ---- grouped & day-filtered -------------------------------------------
    const todaysItems = useMemo(() => {
        return items
            .filter((it) => {
                const start = it.session_start || it.start;
                if (!start) return false;
                return isSameDay(new Date(start), selectedDay);
            })
            .map((it) => {
                const start = new Date(it.session_start || it.start);
                const end = new Date(it.session_end || it.end);
                const startMin = start.getHours() * 60 + start.getMinutes();
                const endMin = end.getHours() * 60 + end.getMinutes();
                return { ...it, _startMin: startMin, _endMin: endMin };
            })
            .sort((a, b) => a._startMin - b._startMin);
    }, [items, selectedDay]);

    // Auto-extend the visible hour range so all sessions fit.
    const { dayStartHour, dayEndHour } = useMemo(() => {
        let minH = DEFAULT_DAY_START * 60;
        let maxH = DEFAULT_DAY_END * 60;
        todaysItems.forEach((it) => {
            if (it._startMin < minH) minH = it._startMin;
            if (it._endMin > maxH) maxH = it._endMin;
        });
        return {
            dayStartHour: Math.max(0, Math.floor(minH / 60)),
            dayEndHour: Math.min(24, Math.ceil(maxH / 60)),
        };
    }, [todaysItems]);

    const totalHours = Math.max(1, dayEndHour - dayStartHour);
    const gridHeight = totalHours * HOUR_HEIGHT;

    // overlap detection — assigns each event a "column" if needed
    const placedItems = useMemo(() => {
        const placed = [];
        todaysItems.forEach((it) => {
            // find existing concurrent group
            const overlaps = placed.filter(
                (p) => !(p._endMin <= it._startMin || p._startMin >= it._endMin)
            );
            const usedCols = new Set(overlaps.map((p) => p._col));
            let col = 0;
            while (usedCols.has(col)) col++;
            const groupCols = Math.max(col + 1, ...overlaps.map((p) => (p._cols || 1)));
            // bump cols on overlaps
            overlaps.forEach((p) => {
                if ((p._cols || 1) < groupCols) p._cols = groupCols;
            });
            placed.push({ ...it, _col: col, _cols: groupCols });
        });
        return placed;
    }, [todaysItems]);

    if (profileLoaded && !staff?.id) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Ionicons name="person-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No profile loaded. Please sign in again.
                    </Text>
                </View>
            </View>
        );
    }

    const today = new Date();
    const showingToday = isSameDay(selectedDay, today);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const nowTopOffset = (nowMinutes - dayStartHour * 60) * (HOUR_HEIGHT / 60);
    const nowVisible = showingToday && nowMinutes >= dayStartHour * 60 && nowMinutes <= dayEndHour * 60;

    // ---- render -----------------------------------------------------------
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Week navigator */}
            <View style={[styles.weekBar, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => goToDay(addDays(selectedDay, -7))} style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => goToDay(new Date())}>
                    <Text style={[styles.weekLabel, { color: colors.textPrimary }]}>
                        {selectedDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => goToDay(addDays(selectedDay, 7))} style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Day chip strip */}
            <View style={[styles.dayStrip, { borderBottomColor: colors.border }]}>
                {Array.from({ length: 7 }).map((_, i) => {
                    const d = addDays(weekStart, i);
                    const active = isSameDay(d, selectedDay);
                    const isToday = isSameDay(d, today);
                    return (
                        <TouchableOpacity
                            key={d.toISOString()}
                            onPress={() => goToDay(d)}
                            style={[
                                styles.dayChip,
                                active && { backgroundColor: colors.primary },
                            ]}
                        >
                            <Text style={[
                                styles.dayChipDow,
                                {
                                    color: active ? '#fff' : (isToday ? colors.primary : colors.textSecondary),
                                    fontWeight: isToday || active ? '700' : '500',
                                },
                            ]}>
                                {d.toLocaleDateString(undefined, { weekday: 'short' })}
                            </Text>
                            <Text style={[
                                styles.dayChipNum,
                                { color: active ? '#fff' : colors.textPrimary },
                            ]}>
                                {d.getDate()}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {isLoading && items.length === 0 ? (
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : error && items.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <Animated.View
                    style={{ flex: 1, transform: [{ translateX: slideX }] }}
                    {...panResponder.panHandlers}
                >
                    <ScrollView
                        contentContainerStyle={{ paddingBottom: 24 }}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    >
                        {/* Selected day label */}
                        <View style={styles.dayHeader}>
                            <Text style={[styles.dayLabel, { color: showingToday ? colors.primary : colors.textPrimary }]}>
                                {selectedDay.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                            </Text>
                            {showingToday ? (
                                <View style={[styles.todayPill, { borderColor: colors.primary, backgroundColor: colors.primary + '22' }]}>
                                    <Text style={[styles.todayPillText, { color: colors.primary }]}>Today</Text>
                                </View>
                            ) : null}
                        </View>

                        {placedItems.length === 0 ? (
                            <View style={styles.emptyDay}>
                                <Ionicons name="calendar-outline" size={36} color={colors.textSecondary} />
                                <Text style={[styles.empty, { color: colors.textSecondary, fontSize: 14 }]}>
                                    Nothing scheduled.
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.gridWrap, { height: gridHeight }]}>
                                {/* Hour rows (lines + labels) */}
                                {Array.from({ length: totalHours + 1 }).map((_, i) => {
                                    const hour = dayStartHour + i;
                                    const top = i * HOUR_HEIGHT;
                                    return (
                                        <View key={hour} style={[styles.hourRow, { top, borderTopColor: colors.divider }]}>
                                            <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>
                                                {formatHour(hour)}
                                            </Text>
                                        </View>
                                    );
                                })}

                                {/* Blocks layer — percentages here resolve against the
                                    area to the right of the hour axis. */}
                                <View style={styles.blocksLayer}>
                                    {/* Now line (drawn here so it spans the same area as blocks) */}
                                    {nowVisible ? (
                                        <View style={[styles.nowLine, { top: nowTopOffset, borderTopColor: colors.error || '#dc2626' }]}>
                                            <View style={[styles.nowDot, { backgroundColor: colors.error || '#dc2626' }]} />
                                        </View>
                                    ) : null}

                                    {placedItems.map((it, i) => {
                                        const palette = colors[colorKey(it.class_id || it.class?.title || it.class_title || i)];
                                        const top = (it._startMin - dayStartHour * 60) * (HOUR_HEIGHT / 60);
                                        const heightPx = Math.max(28, (it._endMin - it._startMin) * (HOUR_HEIGHT / 60));
                                        const cols = it._cols || 1;
                                        const colWidthPct = 100 / cols;
                                        const leftPct = it._col * colWidthPct;
                                        const classTitle = it.class?.title || it.class_title || it.title || 'Class';
                                        const roomName = it.room?.name || it.room_name;
                                        const compact = heightPx < 50;
                                        return (
                                            <TouchableOpacity
                                                key={`${it.id ?? i}-${it._col}`}
                                                onPress={() => setPicked(it)}
                                                activeOpacity={0.85}
                                                style={[
                                                    styles.block,
                                                    {
                                                        top,
                                                        height: heightPx,
                                                        left: `${leftPct}%`,
                                                        width: `${colWidthPct}%`,
                                                        backgroundColor: palette?.background || colors.cardBackground,
                                                        borderLeftColor: palette?.text || colors.primary,
                                                        borderColor: palette?.border || colors.border,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[styles.blockTitle, { color: palette?.text || colors.textPrimary }]}
                                                    numberOfLines={compact ? 1 : 2}
                                                >
                                                    {classTitle}
                                                </Text>
                                                {!compact ? (
                                                    <Text style={[styles.blockMeta, { color: palette?.text || colors.textSecondary }]}>
                                                        {formatTime(it.session_start)} – {formatTime(it.session_end)}
                                                        {roomName ? ` · ${roomName}` : ''}
                                                    </Text>
                                                ) : null}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </Animated.View>
            )}

            {/* Detail modal */}
            <Modal
                visible={!!picked}
                transparent
                animationType="fade"
                onRequestClose={() => setPicked(null)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setPicked(null)}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.modal, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            {picked ? (() => {
                                const palette = colors[colorKey(picked.class_id || picked.class?.title || picked.class_title)];
                                const classTitle = picked.class?.title || picked.class_title || picked.title || 'Class';
                                const courseTitle = picked.class?.description || picked.course_title;
                                const roomName = picked.room?.name || picked.room_name;
                                const duration = picked._endMin - picked._startMin;
                                return (
                                    <>
                                        <View style={[styles.modalAccent, { backgroundColor: palette?.text || colors.primary }]} />
                                        <View style={styles.modalBody}>
                                            <View style={styles.modalHeader}>
                                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                                    {classTitle}
                                                </Text>
                                                <TouchableOpacity onPress={() => setPicked(null)} style={{ padding: 4 }}>
                                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                                </TouchableOpacity>
                                            </View>
                                            {courseTitle ? (
                                                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                                                    {courseTitle}
                                                </Text>
                                            ) : null}
                                            <View style={[styles.modalDivider, { backgroundColor: colors.divider }]} />
                                            <ModalRow icon="time-outline" colors={colors}
                                                value={`${formatTime(picked.session_start)} – ${formatTime(picked.session_end)} · ${duration} min`} />
                                            {roomName ? (
                                                <ModalRow icon="location-outline" colors={colors} value={roomName} />
                                            ) : null}
                                            <ModalRow icon="calendar-outline" colors={colors}
                                                value={selectedDay.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
                                        </View>
                                    </>
                                );
                            })() : null}
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

function ModalRow({ icon, value, colors }) {
    return (
        <View style={styles.modalRow}>
            <Ionicons name={icon} size={16} color={colors.textSecondary} />
            <Text style={[styles.modalRowText, { color: colors.textPrimary }]}>{value}</Text>
        </View>
    );
}

function formatHour(h) {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    weekBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    navBtn: { padding: 6 },
    weekLabel: { fontSize: 14, fontWeight: '600' },
    dayStrip: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    dayChip: {
        flex: 1,
        marginHorizontal: 2,
        alignItems: 'center',
        paddingVertical: 6,
        borderRadius: 10,
    },
    dayChipDow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    dayChipNum: { fontSize: 16, fontWeight: '700', marginTop: 2 },
    dayHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    dayLabel: { fontSize: 16, fontWeight: '700' },
    todayPill: {
        paddingHorizontal: 8,
        paddingVertical: 1,
        borderRadius: 999,
        borderWidth: 1,
    },
    todayPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    emptyDay: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 8 },
    gridWrap: {
        position: 'relative',
        marginHorizontal: 8,
    },
    hourRow: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        borderTopWidth: 1,
    },
    hourLabel: {
        position: 'absolute',
        top: -8,
        left: 0,
        width: HOUR_AXIS_WIDTH - 8,
        textAlign: 'right',
        fontSize: 11,
        fontWeight: '500',
    },
    blocksLayer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: HOUR_AXIS_WIDTH,
        right: 4,
    },
    nowLine: {
        position: 'absolute',
        left: -4,
        right: 0,
        height: 1,
        borderTopWidth: 2,
        zIndex: 5,
    },
    nowDot: {
        position: 'absolute',
        left: -4,
        top: -5,
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    block: {
        position: 'absolute',
        borderWidth: 1,
        borderLeftWidth: 4,
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
        overflow: 'hidden',
    },
    blockTitle: { fontSize: 12, fontWeight: '700' },
    blockMeta: { fontSize: 10, marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    modal: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 14,
        overflow: 'hidden',
    },
    modalAccent: { width: 5 },
    modalBody: { flex: 1, padding: 16, gap: 6 },
    modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    modalTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
    modalSub: { fontSize: 13, marginTop: -2 },
    modalDivider: { height: 1, marginVertical: 8 },
    modalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    modalRowText: { fontSize: 14 },
});
