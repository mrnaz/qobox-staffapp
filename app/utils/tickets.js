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

// Map priority code → icon + theme color resolver.
// We use functions for color so the same metadata works in any theme.
export const PRIORITY_META = {
    L: { label: 'Low',      icon: 'flag-outline', color: (c) => c.textSecondary },
    N: { label: 'Normal',   icon: 'flag-outline', color: (c) => c.info     || c.primary },
    H: { label: 'High',     icon: 'flag',         color: (c) => c.warning  || c.primary },
    C: { label: 'Critical', icon: 'flag',         color: (c) => c.error    || c.warning },
};

// Map derived status (see `deriveStatus`) → display label + bg/fg resolvers.
export const STATUS_META = {
    open:        { label: 'Open',        bg: (c) => (c.info    || c.primary) + '22', fg: (c) => c.info    || c.primary },
    in_progress: { label: 'In progress', bg: (c) => (c.warning || c.primary) + '22', fg: (c) => c.warning || c.primary },
    closed:      { label: 'Closed',      bg: (c) => c.divider,                       fg: (c) => c.textSecondary },
};

// Suggested categories shown when the backend has no categories configured
// (purely informational — categories must be created via the web admin).
export const DEFAULT_CATEGORIES = ['Maintenance', 'IT / Tech', 'Facilities', 'HR', 'Other'];
