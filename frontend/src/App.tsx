import { FC, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { authService } from './services/auth'
import Dashboard from './pages/Dashboard'
import Activities from './pages/Activities'
import EventsLog from './pages/EventsLog'
import Monitoring from './pages/Monitoring'
import Settings from './pages/Settings'
import Support from './pages/Support'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Blocker from './pages/Blocker'
import NotificationSystem from './components/NotificationSystem'
import './App.css'

const App: FC = () => {
  // Use state to track authentication status so it updates the UI when it changes
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  // Listen for changes to localStorage and custom events
  useEffect(() => {
    const checkAuthStatus = async () => {
      // First check if token exists
      const hasToken = authService.isAuthenticated();
      
      if (!hasToken) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        return;
      }

      // Validate token by trying to get current user
      try {
        await authService.getCurrentUser();
        setIsAuthenticated(true);
      } catch (error) {
        // Token is invalid, clear it
        console.log('Token validation failed, clearing auth:', error);
        authService.clearAuth();
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    // Check initially
    checkAuthStatus();

    // Add event listener for storage changes (in case of multiple tabs)
    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'user') {
        console.log('Storage change detected for:', e.key);
        await checkAuthStatus();
      }
    };

    // Add event listener for auth changes within the same tab
    const handleAuthChange = async () => {
      console.log('Auth change event received');
      await checkAuthStatus();
    };

    // Add event listener for logout button clicks as a backup mechanism
    const handleLogoutClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.logout-button')) {
        console.log('Logout button click detected');
        setTimeout(async () => await checkAuthStatus(), 100);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleAuthChange);
    document.addEventListener('click', handleLogoutClick);

    // Cleanup function
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleAuthChange);
      document.removeEventListener('click', handleLogoutClick);
    };
  }, []);

  // Set up a protected route component
  const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
    return isAuthenticated ? element : <Navigate to="/login" replace />;
  };

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Router>
      {isAuthenticated && <NotificationSystem />}
      <Routes>
        {/* Auth routes - redirect to dashboard if already logged in */}
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} 
        />
        <Route 
          path="/signup" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Signup />} 
        />
        
        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
        <Route path="/activities" element={<ProtectedRoute element={<Activities />} />} />
        <Route path="/events" element={<ProtectedRoute element={<EventsLog />} />} />
        <Route path="/monitoring" element={<ProtectedRoute element={<Monitoring />} />} />
        <Route path="/blocker" element={<ProtectedRoute element={<Blocker />} />} />
        <Route path="/settings" element={<ProtectedRoute element={<Settings />} />} />
        <Route path="/support" element={<ProtectedRoute element={<Support />} />} />
        
        {/* Redirect root to login if not authenticated, otherwise to dashboard */}
        <Route 
          path="/" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} 
        />

        {/* Catch all other routes and redirect to dashboard or login */}
        <Route 
          path="*" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} 
        />
      </Routes>
    </Router>
  )
}

export default App
