// API endpoints for the staff application
export const endpoints = {
    // Authentication
    LOGIN: 'login',
    REGISTER: 'register',
    LOGOUT: 'logout',
    FORGOT_PASSWORD: 'forgot-password',
    RESET_PASSWORD: 'reset-password',
    VERIFY_EMAIL: 'verify-email',
    SELECT_SITE: 'select-site',
    CHECK_OTP: 'check-otp',

    // User
    GET_USER: 'me',

    // Academic periods
    GET_ACADEMIC_PERIODS: 'academic-periods',

    // Dashboard / staff noticeboard feed
    GET_DASHBOARD_NOTICEBOARD: 'dashboard',

    // Reports
    GET_REPORT_CLASSES_COURSES: 'report-schedules/courses-classes',

    // Staff Roster Log (My Roster / shifts)
    QUERY_STAFF_ROSTER_LOG: 'staff-roster-log/query',
    STORE_STAFF_ROSTER_LOG: 'staff-roster-log',
    UPDATE_STAFF_ROSTER_LOG: 'staff-roster-log/{id}',
    UPDATE_STAFF_ROSTER: 'staff/roster/{id}', // for mark-absent (admin-only on backend)

    // My Timetable
    GET_STAFF_TIMETABLE: 'staff/{staff_id}/timetable',

    // Calendar
    GET_CALENDAR_EVENTS_QUERY: 'calendar/events/query',
    GET_CALENDAR_EVENT_TYPES: 'calendar/event-types',

    // Attendance (global)
    GET_DAILY_ATTENDANCE: 'attendances/daily',
    GET_MONTHLY_ATTENDANCE_SUMMARY: 'attendances/monthly-summary',
    CREATE_DAILY_ATTENDANCE: 'attendances/daily',
    TOGGLE_DAILY_ATTENDANCE: 'attendances/daily/toggle',
    SUBMIT_DAILY_ATTENDANCE: 'attendances/daily/submit',
    GET_DAILY_ATTENDANCE_CLIENTS: 'attendances/daily/{id}/clients',
    GET_CLIENTS: 'clients',

    // Classes (staff)
    GET_STAFF_CLASSES: 'staff/classes/{staff_id}',
    GET_CLASS: 'education/classes/{class_id}',
    GET_CLASS_LESSONS: 'education/lessons/{class_id}',
    GET_LESSON: 'education/lessons/lesson/{lesson_id}',
    GET_CLASS_ASSIGNMENTS: 'education/classes/{class_id}/assignments',
    GET_CLASS_ASSIGNMENT: 'education/classes/{class_id}/assignments/{assignment_id}',

    // Progress Reports (mirrors qobox web staff endpoints)
    //  - templates linked to a class:      education/classes/{class_id}/progress-reports
    //  - filled results for a class:       education/classes/{class_id}/progress-report-results
    //  - filled results for a student:     education/clients/{client_id}/progress-report-results
    //  - full template w/ assessments:     progress-reports/{id}
    //  - CRUD on a single filled result:   education/progress-report-results[/{id}]
    GET_CLASS_STUDENTS: 'education/classes/{class_id}/students',
    GET_CLASS_PROGRESS_REPORTS: 'education/classes/{class_id}/progress-reports',
    GET_CLASS_PROGRESS_REPORT_RESULTS: 'education/classes/{class_id}/progress-report-results',
    GET_STUDENT_PROGRESS_REPORT_RESULTS: 'education/clients/{client_id}/progress-report-results',
    GET_PROGRESS_REPORT_TEMPLATE: 'progress-reports/{id}',
    STORE_PROGRESS_REPORT_RESULT: 'education/progress-report-results',
    GET_PROGRESS_REPORT_RESULT: 'education/progress-report-results/{result_id}',
    UPDATE_PROGRESS_REPORT_RESULT: 'education/progress-report-results/{result_id}',
    DELETE_PROGRESS_REPORT_RESULT: 'education/progress-report-results/{result_id}',

    // Tickets / Service Requests (Maintenance Reports)
    GET_MAINTENANCE_REPORTS: 'maintenance-reports',
    GET_MAINTENANCE_REPORT: 'maintenance-reports/{id}',
    STORE_MAINTENANCE_REPORT: 'maintenance-reports',
    UPDATE_MAINTENANCE_REPORT: 'maintenance-reports/{id}',
    DELETE_MAINTENANCE_REPORT: 'maintenance-reports/{id}',
    GET_MAINTENANCE_REPORT_NOTES: 'maintenance-reports/{id}/notes',
    STORE_MAINTENANCE_REPORT_NOTE: 'maintenance-reports/{id}/notes',
    GET_MAINTENANCE_CATEGORIES: 'maintenance-categories',
};

export default endpoints;
