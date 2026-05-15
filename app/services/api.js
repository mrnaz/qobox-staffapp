import endpoints from '../constants/endpoints';
import { ALL_AUTH_KEYS } from '../constants/storageKeys';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ed.qobox.test';
const API_VERSION = 'v1';

// Endpoints whose 401 should NOT auto-redirect to login (the user is already
// trying to authenticate, so a 401 is a real validation/credential error).
const AUTH_ENDPOINTS = new Set(['login', 'register', 'forgot-password', 'reset-password', 'verify-email']);

class ApiService {
    constructor() {
        this.baseURL = `${API_BASE_URL}/api/${API_VERSION}`;
        this.token = null;
    }

    setToken(token) {
        this.token = token;
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}/${endpoint}`;
        const config = {
            headers: this.getHeaders(),
            ...options,
        };

        const response = await fetch(url, config);
        const body = await response.json().catch(() => null);

        if (!response.ok) {
            const endpointKey = endpoint.split('?')[0];

            // Mirror the Vue staff portal's global handlers
            // (resources/js/_staff/utils/api.js):
            //  - 401 on a protected endpoint → wipe + go to login
            //  - 403 with firewall_blocked   → wipe + go to login
            const shouldBounceToLogin =
                (response.status === 401 && !AUTH_ENDPOINTS.has(endpointKey)) ||
                (response.status === 403 && body?.firewall_blocked);

            if (shouldBounceToLogin) {
                this.token = null;
                try { await AsyncStorage.multiRemove(ALL_AUTH_KEYS); } catch { /* ignore */ }
                router.replace('/(auth)/login');
            }

            const error = new Error(body?.message || `HTTP error ${response.status}`);
            error.status = response.status;
            error.body = body;
            throw error;
        }

        return body;
    }

    async get(endpoint, params = {}) {
        const cleaned = {};
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') cleaned[k] = String(v);
        });
        const queryString = new URLSearchParams(cleaned).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // For multipart/form-data uploads (photos, files). FormData body — do NOT
    // set Content-Type ourselves so the runtime appends the boundary.
    async requestForm(endpoint, method = 'POST', formData) {
        const url = `${this.baseURL}/${endpoint}`;
        const headers = { 'Accept': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        const response = await fetch(url, { method, headers, body: formData });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(body?.message || `HTTP error ${response.status}`);
            error.status = response.status;
            error.body = body;
            throw error;
        }
        return body;
    }

    // Authentication
    async login(credentials) {
        return this.post(endpoints.LOGIN, credentials);
    }

    async register(userData) {
        return this.post(endpoints.REGISTER, userData);
    }

    async logout() {
        return this.post(endpoints.LOGOUT);
    }

    async forgotPassword(email) {
        return this.post(endpoints.FORGOT_PASSWORD, { email });
    }

    async resetPassword(token, password) {
        return this.post(endpoints.RESET_PASSWORD, { token, password });
    }

    async verifyEmail(token) {
        return this.post(endpoints.VERIFY_EMAIL, { token });
    }

    async selectSite(siteId) {
        return this.post(endpoints.SELECT_SITE, { site_id: siteId });
    }

    async checkOtp(otp, rememberDevice = false) {
        return this.post(endpoints.CHECK_OTP, { otp, remember_device: rememberDevice });
    }

    async getUser() {
        return this.get(endpoints.GET_USER);
    }

    // Academic periods
    async getAcademicPeriods() {
        return this.get(endpoints.GET_ACADEMIC_PERIODS);
    }

    // Dashboard / staff noticeboard feed
    async getDashboardNoticeboard(params = {}) {
        return this.get(endpoints.GET_DASHBOARD_NOTICEBOARD, params);
    }

    // Reports
    async getReportClassesCourses(params = {}) {
        return this.get(endpoints.GET_REPORT_CLASSES_COURSES, params);
    }

    // Staff Roster Log (My Roster)
    async getMyShifts(params = {}) {
        return this.get(endpoints.QUERY_STAFF_ROSTER_LOG, params);
    }

    async createShiftLog(data) {
        return this.post(endpoints.STORE_STAFF_ROSTER_LOG, data);
    }

    async updateShiftLog(id, data) {
        return this.put(endpoints.UPDATE_STAFF_ROSTER_LOG.replace('{id}', id), data);
    }

    async updateStaffRoster(id, data) {
        // Used for "mark myself as absent". Backend policy currently requires
        // `manage_staff_roster` ability — works for admins/coordinators only.
        return this.put(endpoints.UPDATE_STAFF_ROSTER.replace('{id}', id), data);
    }

    // Timetable
    async getStaffTimetable(staffId, params = {}) {
        return this.get(endpoints.GET_STAFF_TIMETABLE.replace('{staff_id}', staffId), params);
    }

    // Calendar
    async getCalendarEvents(params = {}) {
        return this.get(endpoints.GET_CALENDAR_EVENTS_QUERY, params);
    }

    async getCalendarEventTypes() {
        return this.get(endpoints.GET_CALENDAR_EVENT_TYPES);
    }

    // Attendance
    async getDailyAttendance(params = {}) {
        return this.get(endpoints.GET_DAILY_ATTENDANCE, params);
    }

    async getMonthlyAttendanceSummary(params = {}) {
        return this.get(endpoints.GET_MONTHLY_ATTENDANCE_SUMMARY, params);
    }

    async createDailyAttendance(data) {
        return this.post(endpoints.CREATE_DAILY_ATTENDANCE, data);
    }

    async toggleDailyAttendance(data) {
        return this.post(endpoints.TOGGLE_DAILY_ATTENDANCE, data);
    }

    async submitDailyAttendance(data) {
        return this.post(endpoints.SUBMIT_DAILY_ATTENDANCE, data);
    }

    async getDailyAttendanceClients(id) {
        return this.get(endpoints.GET_DAILY_ATTENDANCE_CLIENTS.replace('{id}', id));
    }

    async getClients(params = {}) {
        return this.get(endpoints.GET_CLIENTS, params);
    }

    // Classes (staff)
    async getStaffClasses(staffId, params = {}) {
        return this.get(endpoints.GET_STAFF_CLASSES.replace('{staff_id}', staffId), params);
    }

    async getClass(classId, params = {}) {
        return this.get(endpoints.GET_CLASS.replace('{class_id}', classId), params);
    }

    async getClassLessons(classId, params = {}) {
        return this.get(endpoints.GET_CLASS_LESSONS.replace('{class_id}', classId), params);
    }

    async getClassAssignments(classId, params = {}) {
        return this.get(endpoints.GET_CLASS_ASSIGNMENTS.replace('{class_id}', classId), params);
    }

    async getClassAssignment(classId, assignmentId, params = {}) {
        return this.get(
            endpoints.GET_CLASS_ASSIGNMENT
                .replace('{class_id}', classId)
                .replace('{assignment_id}', assignmentId),
            params
        );
    }

    // Tickets / Service Requests (Maintenance Reports)
    async getMaintenanceReports(params = {}) {
        return this.get(endpoints.GET_MAINTENANCE_REPORTS, params);
    }
    async getMaintenanceReport(id) {
        return this.get(endpoints.GET_MAINTENANCE_REPORT.replace('{id}', id));
    }
    async createMaintenanceReport(data) {
        return this.post(endpoints.STORE_MAINTENANCE_REPORT, data);
    }
    async updateMaintenanceReport(id, data) {
        return this.put(endpoints.UPDATE_MAINTENANCE_REPORT.replace('{id}', id), data);
    }
    async deleteMaintenanceReport(id) {
        return this.delete(endpoints.DELETE_MAINTENANCE_REPORT.replace('{id}', id));
    }
    async getMaintenanceReportNotes(id) {
        return this.get(endpoints.GET_MAINTENANCE_REPORT_NOTES.replace('{id}', id));
    }
    async addMaintenanceReportNote(id, data) {
        return this.post(endpoints.STORE_MAINTENANCE_REPORT_NOTE.replace('{id}', id), data);
    }
    async getMaintenanceCategories() {
        return this.get(endpoints.GET_MAINTENANCE_CATEGORIES);
    }
}

const api = new ApiService();
export default api;
