import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import useTodayAgenda from '../hooks/useTodayAgenda';
import { formatClock } from '../utils/datetime';

const pluralAttendees = (n) => (n === 1 ? '1 attendee' : `${n} attendees`);

const eventLocation = (ev) =>
    ev.location_description ||
    [ev.location_building?.name, ev.location_room?.name].filter(Boolean).join(', ');

export default function TodayScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = React.useState(null);
    const [orgId, setOrgId] = React.useState(null);

    React.useEffect(() => {
        (async () => {
            const [s, org] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('organisationId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setOrgId(org);
        })();
    }, []);

    const { classes, events, ptms, loading, refresh } = useTodayAgenda(staff?.id, orgId);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Today</Text>
                <View style={styles.iconBtn} />
            </View>

            <ScrollView
                contentContainerStyle={styles.container}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.primary} />
                }
            >
                {loading && classes.length === 0 && events.length === 0 && ptms.length === 0 ? (
                    <ActivityIndicator color={colors.primary} style={{ paddingVertical: 32 }} />
                ) : (
                    <>
                        <Section title="Classes" colors={colors} empty="No classes today" count={classes.length}>
                            {classes.map((it, i) => {
                                const title = it.class?.title || it.class_title || it.title || 'Class';
                                return (
                                    <Row key={`c-${it.id ?? i}`} colors={colors}
                                        avatar={<Avatar uri={it.class?.photo} name={title} size={40} />}
                                        title={title}
                                        subtitle={it.room?.name || it.room_name}
                                        right={formatClock(it.session_start || it.start)}
                                    />
                                );
                            })}
                        </Section>

                        <Section title="Calendar" colors={colors} empty="No calendar events today" count={events.length}>
                            {events.map((ev, i) => {
                                const loc = eventLocation(ev);
                                return (
                                    <View key={`e-${ev.id ?? i}`} style={[styles.block, { borderColor: colors.border }]}>
                                        <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>
                                            {ev.title || ev.name || 'Event'}
                                        </Text>
                                        <View style={styles.metaRow}>
                                            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                                {ev.all_day ? 'All day' : `Today @ ${formatClock(ev.start_at || ev.start_date || ev.start)}`}
                                            </Text>
                                        </View>
                                        {loc ? (
                                            <View style={styles.metaRow}>
                                                <Ionicons name="location-outline" size={14} color={colors.success || colors.primary} />
                                                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{loc}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </Section>

                        <Section title="PTMs" colors={colors} empty="No PTM meetings today" count={ptms.length}>
                            {ptms.map((p, i) => {
                                const name = p.student?.full_name || 'Student';
                                const count = Number(p.attendees_count) || 0;
                                const heading = count > 0 ? `${name} (${pluralAttendees(count)})` : name;
                                return (
                                    <Row key={`p-${p.id ?? i}`} colors={colors}
                                        avatar={<Avatar name={name} size={40} />}
                                        title={heading}
                                        subtitle={p.location_label}
                                        right={formatClock(p.timeslot?.ptm_start)}
                                        stacked
                                    />
                                );
                            })}
                        </Section>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function Section({ title, children, colors, empty, count }) {
    return (
        <View style={{ marginBottom: 20 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title.toUpperCase()}</Text>
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                {count === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{empty}</Text>
                ) : children}
            </View>
        </View>
    );
}

function Row({ avatar, title, subtitle, right, colors, stacked }) {
    return (
        <View style={styles.row}>
            {avatar}
            <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
                {subtitle ? (
                    <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
                ) : null}
                {stacked && right ? (
                    <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{right}</Text>
                ) : null}
            </View>
            {!stacked && right ? (
                <Text style={[styles.rowRight, { color: colors.textPrimary }]}>{right}</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 8,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    container: { padding: 16, paddingBottom: 40 },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowTitle: { fontSize: 15, fontWeight: '600' },
    rowSub: { fontSize: 12, marginTop: 2 },
    rowRight: { fontSize: 14, fontWeight: '600' },
    block: { paddingVertical: 12, gap: 4 },
    blockTitle: { fontSize: 15, fontWeight: '600' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 12 },
    emptyText: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
});
