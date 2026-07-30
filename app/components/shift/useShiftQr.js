import { useCallback, useState } from 'react';
import api from '../../services/api';
import { isToday } from '../../utils/datetime';

/**
 * Is this shift eligible for a kiosk QR at all?
 *
 * Two cases qualify, and the second is easy to miss: a shift rostered for today,
 * OR a shift that is currently open. The open case exists because a 22:00-02:00
 * shift was rostered "yesterday" by the time anyone clocks out of it — gating
 * purely on "today" would strand every night shift at the kiosk.
 *
 * The backend applies the same rule and answers 422 "Invalid QR" otherwise, so
 * this check is about never rendering a code that is already known to fail.
 */
export const canShowShiftQr = (shift) => {
    if (!shift) return false;

    const isOpen = Boolean(shift.actual_start && !shift.actual_end);
    if (isOpen) return true;

    return isToday(shift.rostered_start || shift.claimed_start);
};

/**
 * Loads and holds the per-shift kiosk token. The kiosk scans QBXSHIFT:<uuid> and
 * infers the direction from the shift's own state, so the same code both clocks
 * in and clocks out — there is no separate check-out token to fetch.
 */
export default function useShiftQr() {
    const [visible, setVisible] = useState(false);
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const open = useCallback(async (shift) => {
        setVisible(true);
        setToken('');
        setError('');

        if (! shift?.staff_roster_id) {
            // Logs created at a kiosk by staff search have no roster behind them,
            // and the token lives on the roster row.
            setError('This shift has no roster, so it has no QR code.');

            return;
        }

        if (! canShowShiftQr(shift)) {
            setError("Invalid QR — a QR code is only available for today's shift.");

            return;
        }

        setLoading(true);
        try {
            const res = await api.getRosterCheckinToken(shift.staff_roster_id);
            setToken(res?.token || '');
            if (! res?.token) setError('No QR token returned.');
        } catch (err) {
            setError(err.body?.message || err.message || 'Could not load the QR code.');
        } finally {
            setLoading(false);
        }
    }, []);

    const close = useCallback(() => setVisible(false), []);

    return { visible, token, loading, error, open, close };
}
