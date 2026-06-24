// Shared metadata for the Tickets / Service Requests screens.
// Backend uses Maintenance Reports under the hood (see staff/api.php).

// Backend priority codes: L (Low) / N (Normal) / H (High) / C (Critical)
export const PRIORITIES = [
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'Normal' },
    { value: 'H', label: 'High' },
    { value: 'C', label: 'Critical' },
];

// Backend has NO `status` column on maintenance_reports — status is derived
// from the `assigned` and `resolved` timestamp fields:
//   - `resolved`     → closed
//   - `assigned`     → in_progress
//   - neither        → open
// To change status from the client, we PUT `{resolved: true}` to close the
// report (the Vue web does the same — see ResolveMaintenanceReport.vue:478).
export const deriveStatus = (report) => {
    if (!report) return 'open';
    if (report.resolved) return 'closed';
    if (report.assigned || report.assigned_to) return 'in_progress';
    return 'open';
};

// Priority icon + color — mirrors the web staff portal
// (MaintenanceReporting.vue priorityIcon / priorityColor). Colours resolve from
// the app's standard theme tokens (info/success/warning/error) so they match the
// rest of the UI and adapt to light/dark mode. `color(colors)` is called with the
// active theme palette at render time.
export const PRIORITY_META = {
    L: { label: 'Low',      icon: 'arrow-down-circle', color: (c) => c.info },
    N: { label: 'Normal',   icon: 'remove-circle',     color: (c) => c.success },
    H: { label: 'High',     icon: 'arrow-up-circle',   color: (c) => c.warning },
    C: { label: 'Critical', icon: 'arrow-up-circle',   color: (c) => c.error },
};

// Map derived status (see `deriveStatus`) → display label + bg/fg resolvers.
export const STATUS_META = {
    open:        { label: 'Open',        bg: (c) => (c.info    || c.primary) + '22', fg: (c) => c.info    || c.primary },
    in_progress: { label: 'In progress', bg: (c) => (c.warning || c.primary) + '22', fg: (c) => c.warning || c.primary },
    closed:      { label: 'Closed',      bg: (c) => c.divider,                       fg: (c) => c.textSecondary },
};

