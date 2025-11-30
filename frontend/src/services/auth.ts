import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      console.log('Making login request with credentials:', { ...credentials, password: '***' });
      
      // Clear any existing auth data before attempting login
      this.clearAuth();
      
      const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.LOGIN, credentials);
      
      if (!response.data || !response.data.token || !response.data.user) {
        throw new Error('Invalid response from server: Missing token or user data');
      }
      
      console.log('Login response received:', { 
        token: '***', 
        user: response.data.user 
      });
      
      // Store auth data
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Dispatch auth change event
      window.dispatchEvent(new Event('auth-change'));
      
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Clear any existing auth data on error
      this.clearAuth();
      
      // Throw a more user-friendly error
      if (error.response?.status === 423) {
        // Account locked (from backend)
        throw new Error(error.response?.data?.message || 'Too many failed attempts. Try again later.');
      } else if (error.response?.status === 401) {
        throw new Error('Invalid email or password');
      } else if (!error.response) {
        throw new Error('Network error. Please check your connection and try again.');
      } else {
        throw new Error(error.response?.data?.message || 'An error occurred during login');
      }
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      console.log('Making registration request...');
      const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.REGISTER, data);
      
      if (!response.data || !response.data.token || !response.data.user) {
        throw new Error('Invalid response from server: Missing token or user data');
      }
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Dispatch auth change event
      window.dispatchEvent(new Event('auth-change'));
      
      return response.data;
    } catch (error: any) {
      console.error('Registration error details:', error);
      
      // Handle different error types with specific messages
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || 'Email already registered or invalid data');
      } else if (error.response?.status === 500) {
        throw new Error(error.response.data?.message || 'Server error. Please check if MongoDB is running.');
      } else if (!error.response) {
        // Network error or server not reachable
        throw new Error('Cannot connect to server. Please check if the backend is running on port 5001.');
      } else {
        // Other HTTP errors
        throw new Error(error.response?.data?.message || `Registration failed: ${error.message || 'Unknown error'}`);
      }
    }
  }

  async logout(): Promise<void> {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT);
    } finally {
      this.clearAuth();
      // Dispatch auth change event
      window.dispatchEvent(new Event('auth-change'));
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      const response = await api.get<User>(API_ENDPOINTS.AUTH.ME);
      return response.data;
    } catch (error) {
      this.clearAuth();
      throw error;
    }
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getUser();
    return !!(token && user);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUser(): User | null {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      this.clearAuth();
      return null;
    }
  }

  clearAuth(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  getAuthHeader(): { Authorization: string } | {} {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService(); 