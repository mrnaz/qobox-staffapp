// Calendar utility functions (month-grid helpers only — ported from
// qobox-clientapp/app/utils/calendarUtils.js, minus the dayjs-dependent
// attendance-date helpers this app doesn't need).

// Get the first day of the month
export const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

// Get the last day of the month
export const getLastDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

// Get the first day of the week (Monday)
export const getFirstDayOfWeek = (date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) - 1; // Adjust for Sunday
    return new Date(date.setDate(diff));
};

// Get calendar grid dates for a month
export const getCalendarGrid = (date) => {
    const firstDay = getFirstDayOfMonth(date);
    const firstDayOfWeek = getFirstDayOfWeek(firstDay);

    const grid = [];
    const currentDate = new Date(firstDayOfWeek);

    // Generate 6 weeks (42 days) to ensure we cover the entire month
    for (let i = 0; i < 42; i++) {
        grid.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return grid;
};

// Check if a date is today
export const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
};

// Check if a date is in the current month
export const isCurrentMonth = (date, currentMonth) => {
    return date.getMonth() === currentMonth.getMonth() &&
           date.getFullYear() === currentMonth.getFullYear();
};

// Navigate to next month
export const getNextMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
};

// Navigate to previous month
export const getPrevMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
};

// Navigate to today
export const getToday = () => {
    return new Date();
};

// Get day of week labels
export const getDayLabels = () => {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
};
