// API Configuration
export const API_BASE_URL = 'http://localhost:5001';

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication endpoints
  AUTH: {
    LOGIN: `${API_BASE_URL}/api/auth/login`,
    REGISTER: `${API_BASE_URL}/api/auth/register`,
    LOGOUT: `${API_BASE_URL}/api/auth/logout`,
    ME: `${API_BASE_URL}/api/auth/me`,
  },

  // Alerts endpoints
  ALERTS: {
    LIST: `${API_BASE_URL}/api/alerts`,
    DETAILS: (id: string) => `${API_BASE_URL}/api/alerts/${id}`,
    STATS: `${API_BASE_URL}/api/alerts/stats`,
    UPDATE_STATUS: (id: string) => `${API_BASE_URL}/api/alerts/${id}/status`,
  },

  // Activities endpoints
  ACTIVITIES: {
    LIST: `${API_BASE_URL}/api/activities`,
    REALTIME: `${API_BASE_URL}/api/activities/realtime`,
    STATS: `${API_BASE_URL}/api/activities/stats`,
  },

  // Events endpoints
  EVENTS: {
    LIST: `${API_BASE_URL}/api/events`,
    SEARCH: `${API_BASE_URL}/api/events/search`,
    FILTER: `${API_BASE_URL}/api/events/filter`,
    EXPORT: `${API_BASE_URL}/api/events/export`,
  },

  // Settings endpoints
  SETTINGS: {
    GET: `${API_BASE_URL}/api/settings`,
    UPDATE: `${API_BASE_URL}/api/settings`,
    NOTIFICATIONS: `${API_BASE_URL}/api/settings/notifications`,
  },

  // Support endpoints
  SUPPORT: {
    TICKETS: `${API_BASE_URL}/api/support/tickets`,
    CREATE_TICKET: `${API_BASE_URL}/api/support/tickets`,
    FAQ: `${API_BASE_URL}/api/support/faq`,
  },
}; 