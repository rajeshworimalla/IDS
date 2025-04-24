// API Configuration
export const API_BASE_URL = 'http://localhost:5001/api';

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication endpoints
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    LOGOUT: `${API_BASE_URL}/auth/logout`,
    ME: `${API_BASE_URL}/auth/me`,
  },

  // Alerts endpoints
  ALERTS: {
    LIST: `${API_BASE_URL}/alerts`,
    DETAILS: (id: string) => `${API_BASE_URL}/alerts/${id}`,
    STATS: `${API_BASE_URL}/alerts/stats`,
    UPDATE_STATUS: (id: string) => `${API_BASE_URL}/alerts/${id}/status`,
  },

  // Activities endpoints
  ACTIVITIES: {
    LIST: `${API_BASE_URL}/activities`,
    REALTIME: `${API_BASE_URL}/activities/realtime`,
    STATS: `${API_BASE_URL}/activities/stats`,
  },

  // Events endpoints
  EVENTS: {
    LIST: `${API_BASE_URL}/events`,
    SEARCH: `${API_BASE_URL}/events/search`,
    FILTER: `${API_BASE_URL}/events/filter`,
    EXPORT: `${API_BASE_URL}/events/export`,
  },

  // Settings endpoints
  SETTINGS: {
    GET: `${API_BASE_URL}/settings`,
    UPDATE: `${API_BASE_URL}/settings`,
    NOTIFICATIONS: `${API_BASE_URL}/settings/notifications`,
  },

  // Support endpoints
  SUPPORT: {
    TICKETS: `${API_BASE_URL}/support/tickets`,
    CREATE_TICKET: `${API_BASE_URL}/support/tickets`,
    FAQ: `${API_BASE_URL}/support/faq`,
  },
}; 