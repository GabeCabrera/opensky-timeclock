import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  setup: (email: string, provisionToken: string, password: string) =>
    api.post('/auth/setup', { email, provisionToken, password }),
  validateProvisionToken: (email: string, provisionToken: string) =>
    api.post('/auth/validate-provision-token', { email, provisionToken }),
};

export const timeAPI = {
  clockIn: () => api.post('/time/clock-in'),
  clockOut: (workDescription?: string) => api.post('/time/clock-out', { workDescription }),
  getEntries: () => api.get('/time/entries'),
  getStatus: () => api.get('/time/status'),
  openTimeStream: () => {
    const token = localStorage.getItem('token');
    // Use query param token so EventSource can authenticate (Authorization header not supported by all browsers)
    const url = `${API_BASE_URL.replace(/\/$/, '')}/time/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(url, { withCredentials: false });
    return es; // caller responsible for closing
  },
  deleteEntry: (entryId: number) => api.delete(`/time/entry/${entryId}`),
  createEntry: (clockIn: string, clockOut?: string) => 
    api.post('/time/entry', { clockIn, clockOut }),
  updateEntry: (entryId: number, clockIn: string, clockOut?: string) => 
    api.put(`/time/entry/${entryId}`, { clockIn, clockOut }),
  getSettings: () => api.get('/time/settings'),
  updateSettings: (settings: {
    timeFormat?: string;
    timezone?: string;
    emailNotifications?: boolean;
    emailRejectionNotifications?: boolean;
    reminderNotifications?: boolean;
    autoClockOutEnabled?: boolean;
    autoClockOutTime?: string;
    weekStartDay?: string;
  }) => api.put('/time/settings', settings),
};

export const adminAPI = {
  getPendingEntries: () => api.get('/admin/pending-entries'),
  approveEntry: (entryId: number, notes?: string) => 
    api.patch(`/admin/entry/${entryId}/approval`, { status: 'approved', notes }),
  denyEntry: (entryId: number, notes?: string) => 
    api.patch(`/admin/entry/${entryId}/approval`, { status: 'denied', notes }),
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
  createUser: (firstName: string, lastName: string, email: string, isAdmin?: boolean) =>
    api.post('/admin/create-user', { firstName, lastName, email, isAdmin }),
  regenerateProvisionToken: (userId: number) =>
    api.post(`/admin/regenerate-provision-token/${userId}`),
  updateUser: (userId: number, firstName: string, lastName: string, email: string, isAdmin: boolean, isSuperUser: boolean) =>
    api.put(`/admin/users/${userId}`, { firstName, lastName, email, isAdmin, isSuperUser }),
  deleteUser: (userId: number) =>
    api.delete(`/admin/users/${userId}`),
  getUserSettings: (userId: number) => api.get(`/admin/user/${userId}/settings`),
  updateUserSettings: (userId: number, settings: {
    hourlyRate?: number;
    taxRate?: number;
    paySchedule?: string;
    overtimeEnabled?: boolean;
    overtimeRate?: number;
    timeFormat?: string;
    timezone?: string;
    emailNotifications?: boolean;
  }) => api.put(`/admin/user/${userId}/settings`, settings),
  // New detailed user endpoints
  getFullUser: (userId: number) => api.get(`/admin/users/${userId}/full`),
  updateUserContact: (userId: number, contact: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    mobilePhone?: string;
  }) => api.put(`/admin/users/${userId}/contact`, contact),
  getPayrollPeriodHours: () => api.get('/admin/payroll/period-hours'),
  getUserTimeEntries: (userId: number, params?: { page?: number; pageSize?: number; approval?: string; manual?: string }) =>
    api.get(`/admin/users/${userId}/time-entries`, { params }),
  getUserTimeStatus: (userId: number) => api.get(`/admin/users/${userId}/time-status`),
  openAdminTimeStream: () => {
    const token = localStorage.getItem('token');
    const url = `${API_BASE_URL.replace(/\/$/, '')}/admin/time/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    return new EventSource(url, { withCredentials: false });
  }
};

export default api;