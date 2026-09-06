import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Theme from '../context/ThemeContext';
import CalendarView from '../components/CalendarView';
import api from '../services/api';

export default function CalendarScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [organisationId, setOrganisationId] = useState(null);

    useEffect(() => {
        (async () => {
            const [s, org] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('organisationId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setOrganisationId(org);
            setProfileLoaded(true);
        })();
    }, []);

    const loadEvents = useCallback(async ({ from, to }) => {
        if (!staff?.id) return [];
        // Backend (CalendarEventsController::index_query) expects `from`/`to`
        // and `org_id` (not start/end/organisation_id).
        const res = await api.getCalendarEvents({
            from: from.toISOString().slice(0, 10),
            to: to.toISOString().slice(0, 10),
            staff_id: staff.id,
            org_id: organisationId,
        });
        const list = res?.events || res?.data || res || [];
        return Array.isArray(list) ? list : [];
    }, [staff, organisationId]);

    const loadEventTypes = useCallback(async () => {
        try {
            const res = await api.getCalendarEventTypes({ organisation_id: organisationId });
            const list = res?.data || res?.calendar_event_types || res || [];
            return (Array.isArray(list) ? list : []).map((t) => ({
                id: t.id,
                label: t.label || t.name || 'Calendar',
                color: t.color || 'steel',
            }));
        } catch (err) {
            console.warn('Calendar event types load failed', err?.message || err);
            return [];
        }
    }, [organisationId]);

    if (profileLoaded && !staff?.id) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
                    No profile loaded. Please sign in again.
                </Text>
            </View>
        );
    }

    if (!staff?.id) return null;

    return <CalendarView loadEvents={loadEvents} loadEventTypes={loadEventTypes} reloadKey={`${staff.id}-${organisationId}`} />;
}
