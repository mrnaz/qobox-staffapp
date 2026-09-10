import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    SectionList,
    StyleSheet,
    Animated,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { useSwipeNavigation } from '../hooks/useSwipeNavigation';
import Theme from '../context/ThemeContext';
import {
    getCalendarGrid,
    isToday,
    isCurrentMonth,
    getNextMonth,
    getPrevMonth,
    getToday,
    getDayLabels,
    getFirstDayOfMonth,
    getLastDayOfMonth,
} from '../utils/calendarUtils';
import { computeVisibleSections, findScrollTarget } from '../utils/agendaSections';
import PreviewEventDialog from './PreviewEventDialog';
import CalendarGrid from './CalendarGrid';
import moment from 'moment';
import { FontAwesome, Ionicons } from '@expo/vector-icons';

const CARD_MARGIN = 16;

// The four built-in ("special") calendar categories the backend emits, with
// their default palette colour name. `category` matches the backend
// `event_category`; `key` is the toggle id used in the filter state.
const SPECIAL_EVENT_TYPES = [
    { key: 'classes',     category: 'class_sessions', label: 'Classes',     color: 'azure'  },
    { key: 'assignments', category: 'assignments',    label: 'Assignments', color: 'purple' },
    { key: 'tests',       category: 'tests',          label: 'Tests',       color: 'amber'  },
    { key: 'events',      category: 'events',         label: 'Events',      color: 'lime'   },
];
const CATEGORY_TO_KEY = SPECIAL_EVENT_TYPES.reduce((m, t) => { m[t.category] = t.key; return m; }, {});

// `loadEvents({ from, to })` -> Promise<event[]>, `loadEventTypes()` ->
// Promise<{id, label, color}[]>. Both dates are passed as Date objects; each
// caller formats them however its own endpoint expects. Events are expected
// pre-normalized to `{ id, title, start_at, end_at, all_day, color,
// event_category, event_type, location_site, location_building,
// location_room, repeating, ... }` — normalize in the caller's `loadEvents`
// if the underlying endpoint uses different field names.
export default function CalendarView({ loadEvents, loadEventTypes, reloadKey }) {
    const { useTheme } = Theme;
    const { theme, mode } = useTheme();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [displayDate, setDisplayDate] = useState(new Date());
    const [view, setView] = useState('day');
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [calendarEventTypes, setCalendarEventTypes] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isEventDialogVisible, setIsEventDialogVisible] = useState(false);
    const [visibleCount, setVisibleCount] = useState(100);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');

    // ── Event-type visibility filter ──
    const [specialSelected, setSpecialSelected] = useState(
        () => SPECIAL_EVENT_TYPES.reduce((m, t) => { m[t.key] = true; return m; }, {})
    );
    const [customTypeSelected, setCustomTypeSelected] = useState({});
    const [showUncategorized, setShowUncategorized] = useState(true);
    const [filterVisible, setFilterVisible] = useState(false);

    const displayDateRef = useRef(displayDate);
    const sectionListRef = useRef(null);
    const loadRequestIdRef = useRef(0);
    const scrollTargetDateRef = useRef(null);
    const hasScrolledRef = useRef(false);

    useEffect(() => { displayDateRef.current = displayDate; }, [displayDate]);

    const { panResponder, slideAnim, fadeAnim, isTransitioning } = useSwipeNavigation({
        onNavigatePrev: () => {
            const newDate = getPrevMonth(displayDateRef.current);
            displayDateRef.current = newDate;
            setDisplayDate(newDate);
            setCurrentDate(newDate);
        },
        onNavigateNext: () => {
            const newDate = getNextMonth(displayDateRef.current);
            displayDateRef.current = newDate;
            setDisplayDate(newDate);
            setCurrentDate(newDate);
        },
        enableFade: true,
        threshold: 0.25,
    });

    useEffect(() => { loadCalendarData(); }, [currentDate, reloadKey]);

    useEffect(() => {
        if (!isTransitioning) setDisplayDate(currentDate);
    }, [currentDate]);

    const loadCalendarData = async () => {
        const requestId = ++loadRequestIdRef.current;
        try {
            setIsLoading(true);
            setLoadError('');
            const from = moment(currentDate).startOf('month').toDate();
            const to = moment(currentDate).endOf('month').toDate();
            const [events, types] = await Promise.all([
                loadEvents({ from, to }),
                loadEventTypes ? loadEventTypes() : Promise.resolve([]),
            ]);
            if (requestId !== loadRequestIdRef.current) return;
            const typeList = Array.isArray(types) ? types : [];
            setCalendarEventTypes(typeList);
            setCustomTypeSelected((prev) => {
                const next = { ...prev };
                typeList.forEach((t) => { if (!(t.id in next)) next[t.id] = true; });
                return next;
            });
            setCalendarEvents(Array.isArray(events) ? events : []);
        } catch (error) {
            console.error('Error loading calendar data:', error);
            if (requestId === loadRequestIdRef.current) {
                setLoadError(error?.body?.message || error?.message || 'Failed to load calendar.');
            }
        } finally {
            if (requestId === loadRequestIdRef.current) setIsLoading(false);
        }
    };

    const goToToday = () => {
        const today = getToday();
        setCurrentDate(today);
        setDisplayDate(today);
        scrollTargetDateRef.current = null;
        hasScrolledRef.current = false;
    };

    const handleDatePress = (date) => {
        setCurrentDate(date);
        setDisplayDate(date);
        scrollTargetDateRef.current = date;
        setView('day');
    };

    const handleEventPress = (event) => {
        setSelectedEvent(event);
        setIsEventDialogVisible(true);
    };

    const closeEventDialog = () => {
        setIsEventDialogVisible(false);
        setSelectedEvent(null);
    };

    const isEventVisible = useCallback((event) => {
        const cat = event.event_category;
        if (cat === 'calendar_event' || cat == null) {
            if (event.event_type != null && event.event_type !== '') {
                return customTypeSelected[event.event_type] !== false;
            }
            return showUncategorized;
        }
        const key = CATEGORY_TO_KEY[cat];
        if (!key) return true;
        return specialSelected[key] !== false;
    }, [specialSelected, customTypeSelected, showUncategorized]);

    const filtersActive =
        SPECIAL_EVENT_TYPES.some((t) => specialSelected[t.key] === false) ||
        calendarEventTypes.some((t) => customTypeSelected[t.id] === false) ||
        !showUncategorized;

    const getEventsForDate = (date) => {
        return calendarEvents.filter(event => {
            if (!isEventVisible(event)) return false;
            const eventStartDate = new Date(event.start_at);
            const eventEndDate = new Date(event.end_at);
            const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const dateEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
            return eventStartDate <= dateEnd && eventEndDate >= dateStart;
        });
    };

    const getEventsForDay = (date) => sortEventsByPriority(getEventsForDate(date));

    const getColorFromPalette = (colorName) => {
        const key = String(colorName || 'Azure').toLowerCase();
        return theme.colors[key] || theme.colors.azure;
    };

    const sortEventsByPriority = (events) => {
        return [...events].sort((a, b) => {
            if (moment(a.start_at).isSame(moment(a.end_at), 'day') && !moment(b.start_at).isSame(moment(b.end_at), 'day')) return 1;
            if (!moment(a.start_at).isSame(moment(a.end_at), 'day') && moment(b.start_at).isSame(moment(b.end_at), 'day')) return -1;
            if (a.all_day && !b.all_day) return -1;
            if (!a.all_day && b.all_day) return 1;
            return new Date(a.start_at) - new Date(b.start_at);
        });
    };

    const monthKey = `${displayDate.getFullYear()}-${displayDate.getMonth()}`;

    const agendaSections = useMemo(() => {
        const start = getFirstDayOfMonth(displayDate);
        const end = getLastDayOfMonth(displayDate);
        const sections = [];
        const day = new Date(start);
        while (day <= end) {
            const dayEvents = getEventsForDay(day);
            if (dayEvents.length > 0) {
                sections.push({
                    date: moment(day).format('YYYY-MM-DD'),
                    dayLabel: moment(day).format('dddd, MMM D'),
                    data: dayEvents,
                });
            }
            day.setDate(day.getDate() + 1);
        }
        return sections;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarEvents, monthKey, specialSelected, customTypeSelected, showUncategorized]);

    const { visible: visibleAgendaSections, hasMore: hasMoreAgendaItems } = useMemo(
        () => computeVisibleSections(agendaSections, visibleCount),
        [agendaSections, visibleCount]
    );

    const handleAgendaEndReached = () => {
        if (hasMoreAgendaItems) setVisibleCount((count) => count + 100);
    };

    useEffect(() => {
        setVisibleCount(100);
        hasScrolledRef.current = false;
    }, [monthKey]);

    useEffect(() => {
        if (view === 'day') hasScrolledRef.current = false;
    }, [view]);

    useEffect(() => {
        if (view !== 'day' || isLoading || hasScrolledRef.current) return;
        if (agendaSections.length === 0) { hasScrolledRef.current = true; return; }
        const referenceMoment = scrollTargetDateRef.current ? moment(scrollTargetDateRef.current) : moment();
        const target = findScrollTarget(agendaSections, referenceMoment);
        if (!target) { hasScrolledRef.current = true; return; }
        if (target.itemCountThroughSection > visibleCount) {
            setVisibleCount(target.itemCountThroughSection);
            return;
        }
        hasScrolledRef.current = true;
        scrollTargetDateRef.current = null;
        requestAnimationFrame(() => {
            sectionListRef.current?.scrollToLocation({
                sectionIndex: target.sectionIndex,
                itemIndex: 0,
                animated: false,
                viewPosition: 0,
            });
        });
    }, [view, monthKey, isLoading, agendaSections, visibleCount]);

    const calendarGrid = getCalendarGrid(displayDate);
    const dayLabels = getDayLabels();
    const isCurrentMonthDisplayed = moment(displayDate).isSame(moment(), 'month');

    const renderAgendaView = () => (
        <>
            {agendaSections.length > 0 ? (
                <SectionList
                    ref={sectionListRef}
                    style={styles.dayViewContent}
                    contentContainerStyle={styles.eventsListContainer}
                    scrollEnabled={!isTransitioning}
                    sections={visibleAgendaSections}
                    keyExtractor={(item, index) => `${item.start_at}-${index}`}
                    onEndReached={handleAgendaEndReached}
                    onEndReachedThreshold={0.5}
                    onScrollToIndexFailed={() => {}}
                    renderSectionHeader={({ section }) => (
                        <View style={[styles.agendaSectionHeader, { backgroundColor: theme.colors.cardBackground }]}>
                            <Text style={[styles.agendaSectionHeaderText, { color: theme.colors.textPrimary }]}>
                                {section.dayLabel}
                            </Text>
                        </View>
                    )}
                    renderItem={({ item: event }) => {
                        const accent = getColorFromPalette(event.color);
                        const eventStart = moment(event.start_at);
                        const eventEnd = moment(event.end_at);
                        return (
                            <TouchableOpacity
                                style={[styles.eventListItem, { borderBottomColor: theme.colors.border + '80' }]}
                                onPress={() => handleEventPress(event)}
                            >
                                <View style={[styles.eventBulletDot, { backgroundColor: accent[mode]?.border || theme.colors.primary }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.eventTitleText, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                                        {event.title}
                                    </Text>
                                    {event.all_day ? (
                                        <Text style={[styles.eventTimeText, { color: theme.colors.textSecondary }]}>All day</Text>
                                    ) : (
                                        <View style={{ marginTop: 4 }}>
                                            <Text style={[styles.eventTimeText, { color: theme.colors.textSecondary }]}>
                                                From: {eventStart.format('h:mm A')}
                                            </Text>
                                            <Text style={[styles.eventTimeText, { color: theme.colors.textSecondary }]}>
                                                To: {eventEnd.format('h:mm A')}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            ) : isLoading ? (
                <View style={styles.noEventsContainer}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={[styles.noEventsText, { color: theme.colors.textSecondary, marginTop: 8 }]}>Loading events...</Text>
                </View>
            ) : loadError ? (
                <View style={styles.noEventsContainer}>
                    <Ionicons name="alert-circle-outline" size={32} color={theme.colors.textDisabled} />
                    <Text style={[styles.noEventsText, { color: theme.colors.textSecondary, marginTop: 8 }]}>{loadError}</Text>
                    <TouchableOpacity onPress={loadCalendarData} style={[styles.retryButton, { borderColor: theme.colors.primary }]}>
                        <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.noEventsContainer}>
                    <Text style={[styles.noEventsText, { color: theme.colors.textSecondary }]}>No events this month</Text>
                </View>
            )}
        </>
    );

    const renderMonthView = () => (
        <ScrollView style={styles.calendarContent} scrollEnabled={!isTransitioning}>
            <CalendarGrid
                theme={theme}
                dayLabels={dayLabels}
                calendarGrid={calendarGrid}
                displayDate={displayDate}
                isCurrentMonth={isCurrentMonth}
                isToday={isToday}
                onDatePress={handleDatePress}
                getCellStyle={() => null}
                renderCellExtra={(date) => {
                    const dayEvents = getEventsForDate(date);
                    if (dayEvents.length === 0) return null;
                    return (
                        <View style={styles.badgeCenterContainer}>
                            <View style={[styles.eventCountBadge, { backgroundColor: theme.colors.primary }]}>
                                <Text style={[styles.eventCountText, { color: theme.colors.onPrimary }]}>{dayEvents.length}</Text>
                            </View>
                        </View>
                    );
                }}
            />
        </ScrollView>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Animated.View
                style={[
                    styles.card,
                    { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.borderStrong, shadowColor: theme.colors.cardShadow, shadowOffset: theme.colors.cardShadowOffset, shadowOpacity: theme.colors.cardShadowOpacity, elevation: theme.colors.cardElevation },
                    view === 'day' && styles.cardExpanded,
                    { transform: [{ translateX: slideAnim }] },
                    { opacity: fadeAnim },
                ]}
                {...panResponder.panHandlers}
            >
                <View style={[styles.cardInner, view === 'day' && styles.cardExpanded]}>
                    <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.primary + '15' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                            <Text style={[styles.headerMonthText, { color: theme.colors.textPrimary }]}>
                                {moment(displayDate).format('MMMM')}
                            </Text>
                            <Text style={[styles.headerYearText, { color: theme.colors.textSecondary }]}>
                                {moment(displayDate).format('YYYY')}
                            </Text>
                        </View>

                        <View style={styles.headerRight}>
                            <View style={styles.headerLoadingContainer}>
                                {isLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
                            </View>

                            <TouchableOpacity
                                style={[styles.iconButton, { backgroundColor: isCurrentMonthDisplayed ? theme.colors.primary : theme.colors.surface }]}
                                onPress={goToToday}
                            >
                                <Ionicons name="home" size={18} color={isCurrentMonthDisplayed ? theme.colors.onPrimary : theme.colors.textSecondary} />
                            </TouchableOpacity>

                            <View style={[styles.viewToggle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                                <TouchableOpacity
                                    style={[styles.viewToggleOption, view === 'day' && { backgroundColor: theme.colors.primary }]}
                                    onPress={() => setView('day')}
                                >
                                    <FontAwesome name="list" size={18} color={view === 'day' ? theme.colors.onPrimary : theme.colors.textSecondary} />
                                </TouchableOpacity>
                                <View style={[styles.viewToggleDivider, { backgroundColor: theme.colors.border }]} />
                                <TouchableOpacity
                                    style={[styles.viewToggleOption, view === 'month' && { backgroundColor: theme.colors.primary }]}
                                    onPress={() => setView('month')}
                                >
                                    <FontAwesome name="calendar" size={18} color={view === 'month' ? theme.colors.onPrimary : theme.colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                onPress={() => setFilterVisible(true)}
                                style={styles.iconButton}
                                accessibilityLabel="Filter event types"
                            >
                                <Ionicons
                                    name={filtersActive ? 'funnel' : 'funnel-outline'}
                                    size={18}
                                    color={filtersActive ? theme.colors.primary : theme.colors.textSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {loadError && view === 'month' ? (
                        <View style={[styles.monthErrorBanner, { backgroundColor: (theme.colors.error || theme.colors.warning) + '15', borderColor: theme.colors.error || theme.colors.warning }]}>
                            <Text style={[styles.monthErrorText, { color: theme.colors.textPrimary }]} numberOfLines={2}>{loadError}</Text>
                            <TouchableOpacity onPress={loadCalendarData}>
                                <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {view === 'month' ? renderMonthView() : renderAgendaView()}
                </View>
            </Animated.View>

            <PreviewEventDialog
                isVisible={isEventDialogVisible}
                event={selectedEvent}
                calendarEventTypes={calendarEventTypes}
                onClose={closeEventDialog}
            />

            <Modal
                visible={filterVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setFilterVisible(false)}
            >
                <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setFilterVisible(false)}>
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.filterCard, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}>
                            <View style={[styles.filterHeader, { borderBottomColor: theme.colors.border }]}>
                                <Text style={[styles.filterTitle, { color: theme.colors.textPrimary }]}>Calendar Types</Text>
                                <TouchableOpacity onPress={() => setFilterVisible(false)} style={{ padding: 4 }}>
                                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: 8 }}>
                                <Text style={[styles.filterSection, { color: theme.colors.textSecondary }]}>Special Calendars</Text>
                                {SPECIAL_EVENT_TYPES.map((t) => (
                                    <FilterRow
                                        key={t.key}
                                        theme={theme}
                                        label={t.label}
                                        palette={theme.colors[t.color]}
                                        selected={specialSelected[t.key] !== false}
                                        onToggle={() => setSpecialSelected((s) => ({ ...s, [t.key]: !(s[t.key] !== false) }))}
                                    />
                                ))}

                                <Text style={[styles.filterSection, { color: theme.colors.textSecondary }]}>Custom Calendars</Text>
                                {calendarEventTypes.length === 0 ? (
                                    <Text style={[styles.filterEmpty, { color: theme.colors.textDisabled }]}>No custom calendars found.</Text>
                                ) : (
                                    calendarEventTypes.map((t) => (
                                        <FilterRow
                                            key={t.id}
                                            theme={theme}
                                            label={t.label || t.name || 'Calendar'}
                                            palette={theme.colors[String(t.color || 'steel').toLowerCase()]}
                                            selected={customTypeSelected[t.id] !== false}
                                            onToggle={() => setCustomTypeSelected((s) => ({ ...s, [t.id]: !(s[t.id] !== false) }))}
                                        />
                                    ))
                                )}

                                <Text style={[styles.filterSection, { color: theme.colors.textSecondary }]}>Other</Text>
                                <FilterRow
                                    theme={theme}
                                    label="Uncategorized"
                                    palette={theme.colors.steel}
                                    selected={showUncategorized}
                                    onToggle={() => setShowUncategorized((v) => !v)}
                                />
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

function FilterRow({ theme, label, palette, selected, onToggle }) {
    const accent = palette?.text || theme.colors.primary;
    return (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.filterRow}>
            <View style={[styles.filterSwatch, { backgroundColor: palette?.background || theme.colors.cardBackground, borderColor: palette?.border || theme.colors.border }]} />
            <Text style={[styles.filterLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>{label}</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? accent : theme.colors.textSecondary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    card: { marginTop: 0, marginHorizontal: CARD_MARGIN, marginBottom: CARD_MARGIN, borderRadius: 16, borderWidth: 1 },
    cardExpanded: { flex: 1 },
    cardInner: { borderRadius: 16, overflow: 'hidden' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
    },
    headerMonthText: { fontSize: 18, fontWeight: 'bold' },
    headerYearText: { fontSize: 14 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerLoadingContainer: { width: 24, alignItems: 'center', justifyContent: 'center' },
    iconButton: { padding: 8, borderRadius: 8 },
    viewToggle: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
    viewToggleOption: { paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
    viewToggleDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
    // No flex here: the month grid has a fixed intrinsic height (6 rows) and
    // this ScrollView only exists as an overflow safety net. `flex: 1` would
    // need a flex-bounded ancestor to fill, but the card/cardInner wrapper is
    // only expanded (cardExpanded) in day/agenda view — in month view that
    // left this ScrollView with nothing to fill and it collapsed to zero
    // height, hiding the whole grid behind just the header.
    calendarContent: {},
    dayViewContent: { flex: 1 },
    eventsListContainer: { paddingHorizontal: 0, paddingVertical: 0 },
    eventListItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },
    eventBulletDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10, marginTop: 4 },
    eventTimeText: { fontSize: 12 },
    eventTitleText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
    agendaSectionHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
    agendaSectionHeaderText: { fontSize: 15, fontWeight: 'bold' },
    badgeCenterContainer: { position: 'absolute', top: 15, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
    eventCountBadge: { borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    eventCountText: { fontSize: 11, fontWeight: '700' },
    noEventsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    noEventsText: { fontSize: 16, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 32 },
    retryButton: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    monthErrorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
    monthErrorText: { flex: 1, fontSize: 12 },
    filterOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
    filterCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    filterTitle: { fontSize: 16, fontWeight: '700' },
    filterSection: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    filterEmpty: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    filterSwatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1 },
    filterLabel: { fontSize: 15, fontWeight: '500' },
});
