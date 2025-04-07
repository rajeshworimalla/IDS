import { FC, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Activities from './pages/Activities'
import EventsLog from './pages/EventsLog'
import Monitoring from './pages/Monitoring'
import Settings from './pages/Settings'
import Support from './pages/Support'
import Login from './pages/Login'
import Signup from './pages/Signup'
import './App.css'

const App: FC = () => {
  // Use state to track authentication status so it updates the UI when it changes
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    localStorage.getItem('isAuthenticated') === 'true'
  );

  // Listen for changes to localStorage and custom events
  useEffect(() => {
    const checkAuthStatus = () => {
      const authStatus = localStorage.getItem('isAuthenticated') === 'true';
      console.log('Auth status changed:', authStatus);
      setIsAuthenticated(authStatus);
    };

    // Check initially
    checkAuthStatus();

    // Add event listener for storage changes (in case of multiple tabs)
    window.addEventListener('storage', (e) => {
      if (e.key === 'isAuthenticated') {
        checkAuthStatus();
      }
    });

    // Custom event for auth changes within the same tab
    window.addEventListener('auth-change', checkAuthStatus);

    // Add a direct event listener for logout button clicks
    const handleLogoutClick = () => {
      // This is a backup mechanism to ensure auth state updates
      setTimeout(checkAuthStatus, 200);
    };
    
    // Find and attach listeners to any logout buttons
    const logoutButtons = document.querySelectorAll('.logout-button');
    logoutButtons.forEach(button => {
      button.addEventListener('click', handleLogoutClick);
    });

    return () => {
      window.removeEventListener('storage', checkAuthStatus);
      window.removeEventListener('auth-change', checkAuthStatus);
      logoutButtons.forEach(button => {
        button.removeEventListener('click', handleLogoutClick);
      });
    };
  }, []);

  // Set up a protected route component
  const ProtectedRoute = ({ element }: { element: JSX.Element }) => {
    return isAuthenticated ? element : <Navigate to="/login" replace />;
  };

  return (
    <Router>
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
