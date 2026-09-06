import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Theme from '../context/ThemeContext';
import moment from 'moment';
import { useSwipeNavigation } from '../hooks/useSwipeNavigation';

// How many days on each side of the fetch anchor to load in one window.
const WINDOW_RADIUS_DAYS = 15;
// Give up looking for a non-empty day after this many days in a single direction.
const MAX_SEARCH_DAYS = 30;

const isRealPeriod = (period) =>
    !!period.class_title &&
    period.class_title.toLowerCase() !== 'no class' &&
    period.allow_classes !== false;

// Shared day-card timetable view used by both the staff "My Timetable" tab
// and the student-detail Timetable tab. The parent owns *what* to fetch via
// the `loader` callback; this component owns the day switcher, the windowed
// fetch, the skip-empty-days swipe search, and the card/list layout — ported
// directly from qobox-clientapp/app/components/Timetable.js (same window
// size, same skip-empty-day search, same day-card rendering), adapted to
// fetch through a generic `loader({ startDate, endDate })` prop instead of
// calling the client API directly, since this component is shared by two
// different staff-side screens with two different data sources.
//
// loader signature:
//   ({ startDate, endDate }) => Promise<Array<sessionRow>>
// where `sessionRow` matches StudentTimetableTransformer/staff timetable:
//   { id, session_start, session_end, class_title, room_name, class_id, ... }
export default function TimetableWeekView({ loader, enabled = true }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [currentDate, setCurrentDate] = useState(moment());
    const [timetableData, setTimetableData] = useState({});
    const [dayData, setDayData] = useState(null);

    // Initialize the ref with the initial currentDate
    const currentDateRef = useRef(moment());

    // Use ref to track if initial data has been loaded
    const initialLoadRef = useRef(false);

    // Mirrors of state that the async skip-search loop can read synchronously
    const timetableDataRef = useRef({});
    const windowStartRef = useRef(null);
    const windowEndRef = useRef(null);

    // Swipe navigation hook with fade animations
    const { panResponder, slideAnim, fadeAnim, isTransitioning } = useSwipeNavigation({
        onNavigatePrev: () => {
            navigateSkippingEmptyDays('prev');
        },
        onNavigateNext: () => {
            navigateSkippingEmptyDays('next');
        },
        enableFade: true,
        threshold: 0.3,
    });

    // Initialize data
    useEffect(() => {
        if (enabled && typeof loader === 'function' && !initialLoadRef.current) {
            initialLoadRef.current = true;
            initializeData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, loader]);

    // Update day data when currentDate changes; only fetch if it fell outside the loaded window
    // (e.g. jumping via the Home button after the screen has been open for a while).
    useEffect(() => {
        if (currentDate) {
            currentDateRef.current = currentDate;
            generateDayData();
            if (isOutsideWindow(currentDate)) {
                fetchWindowData(currentDate);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    const initializeData = async () => {
        try {
            setLoading(true);
            generateDayData();
            await fetchWindowData(currentDate);
        } catch (error) {
            console.error('Error initializing timetable data:', error);
        } finally {
            setLoading(false);
        }
    };

    const isOutsideWindow = (date) => {
        if (!windowStartRef.current || !windowEndRef.current) return true;
        return date.isBefore(windowStartRef.current, 'day') || date.isAfter(windowEndRef.current, 'day');
    };

    // Fetches a +/- WINDOW_RADIUS_DAYS window of sessions around anchorDate and merges it into the cache.
    const fetchWindowData = async (anchorDate) => {
        if (!enabled || typeof loader !== 'function') return {};
        const windowStart = moment(anchorDate).subtract(WINDOW_RADIUS_DAYS, 'days');
        const windowEnd = moment(anchorDate).add(WINDOW_RADIUS_DAYS, 'days');

        try {
            const data = await loader({
                startDate: windowStart.format('YYYY-MM-DD'),
                endDate: windowEnd.format('YYYY-MM-DD'),
            });

            const transformed = transformData(Array.isArray(data) ? data : []);

            const merged = { ...timetableDataRef.current, ...transformed };
            timetableDataRef.current = merged;
            setTimetableData(merged);

            windowStartRef.current = windowStartRef.current
                ? moment.min(windowStartRef.current, windowStart)
                : windowStart;
            windowEndRef.current = windowEndRef.current
                ? moment.max(windowEndRef.current, windowEnd)
                : windowEnd;

            return transformed;
        } catch (error) {
            console.error('Error fetching timetable window:', error);
            return {};
        }
    };

    // Groups the loader's flat session rows by calendar date ('YYYY-MM-DD'),
    // using each session's real start time. Timeslots with no session in the
    // requested range carry no date information and are left out — the
    // corresponding dates simply have no entries, which is correctly treated
    // as "empty".
    const transformData = (sessions) => {
        const transformed = {};
        sessions.forEach((session) => {
            const start = session.session_start || session.start;
            if (!start) return;
            const dateKey = moment(start).format('YYYY-MM-DD');
            if (!transformed[dateKey]) transformed[dateKey] = [];
            transformed[dateKey].push(session);
        });
        return transformed;
    };

    const generateDayData = () => {
        setDayData({
            date: currentDate,
            dayName: currentDate.format('dddd'),
            dayNumber: currentDate.format('Do'),
            monthName: currentDate.format('MMMM'),
            year: currentDate.format('YYYY'),
            isToday: currentDate.isSame(moment(), 'day'),
        });
    };

    const isDayEmpty = (date) => {
        const items = timetableDataRef.current[date.format('YYYY-MM-DD')] || [];
        return !items.some(isRealPeriod);
    };

    // Walks day-by-day in the given direction (in-memory while inside the loaded window,
    // fetching a fresh window whenever it walks past an edge) until it finds a day with
    // classes, or gives up after MAX_SEARCH_DAYS.
    const findNextNonEmptyDate = async (fromDate, direction) => {
        let candidate = moment(fromDate);

        for (let daysSearched = 0; daysSearched < MAX_SEARCH_DAYS; daysSearched++) {
            candidate = direction === 'next'
                ? candidate.clone().add(1, 'days')
                : candidate.clone().subtract(1, 'days');

            if (isOutsideWindow(candidate)) {
                setIsSearching(true);
                await fetchWindowData(candidate);
            }

            if (!isDayEmpty(candidate)) {
                setIsSearching(false);
                return candidate;
            }
        }

        setIsSearching(false);
        return candidate;
    };

    const navigateSkippingEmptyDays = async (direction) => {
        const nextDate = await findNextNonEmptyDate(currentDateRef.current, direction);
        setCurrentDate(nextDate);
    };

    const goToToday = () => {
        if (currentDateRef.current.isSame(moment(), 'day')) return; // Already on today

        Animated.timing(fadeAnim, {
            toValue: 0.3,
            duration: 150,
            useNativeDriver: true,
        }).start(() => {
            setCurrentDate(moment());
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        });
    };

    const formatTime = (iso) => (iso ? moment(iso).format('h:mma') : '');

    const dayTimetable = useMemo(() => {
        const dateKey = currentDate.format('YYYY-MM-DD');
        const allPeriods = timetableData[dateKey] || [];
        return allPeriods.filter(isRealPeriod);
    }, [currentDate, timetableData]);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.textPrimary, marginTop: 10 }}>Loading timetable...</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }} {...panResponder.panHandlers}>
            <Animated.View
                style={{
                    flex: 1,
                    opacity: fadeAnim,
                    transform: [{ translateX: slideAnim }],
                }}
            >
                {isSearching ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingTop: 0, paddingBottom: 8 }}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!isTransitioning}
                >
                    {dayData && (
                        <View
                            style={{
                                marginHorizontal: 16,
                                marginTop: 8,
                                marginBottom: 6,
                                borderRadius: 16,
                                backgroundColor: colors.cardBackground,
                                borderWidth: 1,
                                borderColor: colors.borderStrong,
                                shadowColor: colors.cardShadow,
                                shadowOffset: colors.cardShadowOffset,
                                shadowOpacity: colors.cardShadowOpacity,
                                elevation: colors.cardElevation,
                            }}
                        >
                            {/* Day header, with Home button */}
                            <View
                                style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingHorizontal: 16,
                                    paddingVertical: 14,
                                    borderBottomWidth: 1,
                                    borderBottomColor: colors.border,
                                    backgroundColor: dayData.isToday ? colors.primary + '15' : colors.surface,
                                    borderTopLeftRadius: 16,
                                    borderTopRightRadius: 16,
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' }}>
                                        {dayData.dayName}
                                    </Text>
                                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                                        {dayData.dayNumber} {dayData.monthName}, {dayData.year}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    onPress={goToToday}
                                    style={{
                                        padding: 8,
                                        backgroundColor: dayData.isToday ? colors.primary : colors.background,
                                        borderRadius: 8,
                                    }}
                                >
                                    <Ionicons
                                        name="home"
                                        size={20}
                                        color={dayData.isToday ? colors.onPrimary : colors.textSecondary}
                                    />
                                </TouchableOpacity>
                            </View>

                            {dayTimetable.length > 0 ? (
                                dayTimetable.map((period, periodIndex) => {
                                    const classTitle = period.class?.title || period.class_title || period.title || 'Class';
                                    const roomName = period.room?.name || period.room_name;
                                    const classId = period.class_id ?? period.class?.id;
                                    return (
                                        <TouchableOpacity
                                            key={period.id ?? periodIndex}
                                            disabled={!classId}
                                            activeOpacity={classId ? 0.7 : 1}
                                            onPress={() => classId && router.push(`/class/${classId}`)}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'flex-start',
                                                gap: 12,
                                                paddingHorizontal: 16,
                                                paddingVertical: 14,
                                                borderBottomWidth: periodIndex < dayTimetable.length - 1 ? 1 : 0,
                                                borderBottomColor: colors.border,
                                            }}
                                        >
                                            <View style={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: 24,
                                                backgroundColor: colors.primary,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                            }}>
                                                <Text style={{ color: colors.onPrimary, fontSize: 24, fontWeight: '600' }}>
                                                    {classTitle.charAt(0) || '?'}
                                                </Text>
                                            </View>

                                            {/* Class Details */}
                                            <View style={{ flex: 1 }}>
                                                <Text style={{
                                                    color: colors.textPrimary,
                                                    fontSize: 16,
                                                    fontWeight: '700',
                                                    marginBottom: 4
                                                }}>
                                                    {classTitle}
                                                </Text>

                                                <Text style={{
                                                    color: colors.textSecondary,
                                                    fontSize: 12,
                                                    opacity: 0.8
                                                }}>
                                                    {formatTime(period.session_start)} – {formatTime(period.session_end)}
                                                    {roomName ? ` • ${roomName}` : ''}
                                                </Text>
                                            </View>

                                            {classId ? (
                                                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                                            ) : null}
                                        </TouchableOpacity>
                                    );
                                })
                            ) : (
                                /* No Classes */
                                <View style={{
                                    paddingHorizontal: 16,
                                    paddingVertical: 32,
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Ionicons
                                        name="calendar-outline"
                                        size={40}
                                        color={colors.textSecondary}
                                        style={{ marginBottom: 12, opacity: 0.5 }}
                                    />
                                    <Text style={{
                                        color: colors.textSecondary,
                                        fontSize: 16,
                                        fontWeight: '500',
                                        textAlign: 'center'
                                    }}>
                                        No classes on this date
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>
                )}
            </Animated.View>
        </View>
    );
}
