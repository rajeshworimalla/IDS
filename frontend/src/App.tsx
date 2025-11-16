import { FC, useEffect, useState, useRef } from 'react'
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
import AttackAlertModal from './components/AttackAlertModal'
import { io, Socket } from 'socket.io-client'
import './App.css'

interface AttackAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  attackType: string;
  sourceIP: string;
  destinationIP: string;
  description: string;
  timestamp: Date;
}

const App: FC = () => {
  // Use state to track authentication status so it updates the UI when it changes
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    authService.isAuthenticated()
  );
  const [attackAlert, setAttackAlert] = useState<AttackAlert | null>(null);
  const shownAlertsRef = useRef<Set<string>>(new Set()); // Track shown alerts to prevent duplicates

  // Listen for changes to localStorage and custom events
  useEffect(() => {
    const checkAuthStatus = () => {
      const authStatus = authService.isAuthenticated();
      console.log('Auth status changed:', authStatus);
      setIsAuthenticated(authStatus);
    };

    // Check initially
    checkAuthStatus();

    // Add event listener for storage changes (in case of multiple tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'user') {
        console.log('Storage change detected for:', e.key);
        checkAuthStatus();
      }
    };

    // Add event listener for auth changes within the same tab
    const handleAuthChange = () => {
      console.log('Auth change event received');
      checkAuthStatus();
    };

    // Add event listener for logout button clicks as a backup mechanism
    const handleLogoutClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.logout-button')) {
        console.log('Logout button click detected');
        setTimeout(checkAuthStatus, 100);
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

  // Listen for attack alerts via WebSocket
  useEffect(() => {
    if (!isAuthenticated) return;

    const token = authService.getToken();
    if (!token) return;

    const socket: Socket = io('http://localhost:5001', {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Alert System] Connected to WebSocket');
    });

    socket.on('new-packet', (packet: any) => {
      // Only show alerts if:
      // 1. It's marked as malicious (is_malicious === true)
      // 2. AND it's critical or medium severity
      // 3. AND we haven't shown this attack type from this source IP yet
      if (packet.is_malicious === true && (packet.status === 'critical' || packet.status === 'medium')) {
        const severity = packet.status === 'critical' ? 'critical' : 'medium';
        
        // Get actual attack type - don't use "normal" if it's malicious
        let attackType = packet.attack_type || 'unknown_attack';
        
        // If attack_type is "normal" but is_malicious is true, it's an unknown attack
        if (attackType === 'normal' || attackType === 'Normal Traffic') {
          attackType = 'unknown_attack';
        }
        
        // Create unique key: attack_type + source_ip (so we only show once per attack type per source)
        const alertKey = `${attackType}_${packet.start_ip}`;
        
        // Skip if we've already shown this alert
        if (shownAlertsRef.current.has(alertKey)) {
          console.log('[Alert System] Skipping duplicate alert:', alertKey);
          return;
        }
        
        // Mark as shown
        shownAlertsRef.current.add(alertKey);
        
        // Clean up old alerts after 5 minutes to allow re-alerting if needed
        setTimeout(() => {
          shownAlertsRef.current.delete(alertKey);
        }, 5 * 60 * 1000);
        
        // Map attack type to display name
        const attackTypeNames: { [key: string]: string } = {
          'dos': 'Denial of Service (DoS) Attack',
          'probe': 'Port Scanning / Reconnaissance Attack',
          'r2l': 'Remote to Local Attack',
          'u2r': 'User to Root Attack',
          'brute_force': 'Brute Force Attack',
          'unknown_attack': 'Unknown Attack Type',
          'normal': 'Normal Traffic'
        };
        
        const displayAttackType = attackTypeNames[attackType.toLowerCase()] || attackType;
        
        // Map status to severity for alerts
        const alert: AttackAlert = {
          id: packet._id || Date.now().toString(),
          severity,
          attackType: displayAttackType,
          sourceIP: packet.start_ip || 'Unknown',
          destinationIP: packet.end_ip || 'Unknown',
          description: packet.description || `Suspicious ${packet.protocol || 'network'} activity detected`,
          timestamp: new Date(packet.date || Date.now()),
        };

        console.log('[Alert System] 🚨 ATTACK DETECTED:', alert);
        setAttackAlert(alert);
      }
    });

    socket.on('disconnect', () => {
      console.log('[Alert System] Disconnected from WebSocket');
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated]);

  // Set up a protected route component
  const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
    return isAuthenticated ? element : <Navigate to="/login" replace />;
  };

  return (
    <>
      <AttackAlertModal 
        alert={attackAlert} 
        onClose={() => setAttackAlert(null)} 
      />
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
    </>
  )
}

export default App
