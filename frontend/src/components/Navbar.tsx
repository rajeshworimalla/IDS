import { FC } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import '../styles/Navbar.css';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const Navbar: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/dashboard' },
    { id: 'activities', label: 'Activities', icon: '📝', path: '/activities' },
    { id: 'events', label: 'Events Log', icon: '📋', path: '/events' },
    { id: 'monitoring', label: 'Monitoring', icon: '📈', path: '/monitoring' },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
    { id: 'support', label: 'Support', icon: '💬', path: '/support' },
  ];

  const handleLogout = () => {
    try {
      // Clear all authentication data
      localStorage.removeItem('isAuthenticated');
      
      // Create and dispatch a custom event to notify about authentication change
      const authEvent = new Event('auth-change');
      window.dispatchEvent(authEvent);
      
      // Log the action
      console.log('User logged out successfully');
      
      // Force redirect to login page
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 100);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <motion.nav 
      className="navbar"
      initial={{ x: -240 }}
      animate={{ x: 0 }}
      transition={{ type: "spring", stiffness: 100 }}
    >
      <motion.div 
        className="navbar-logo"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <img src="/logo.svg" alt="IDS System" className="logo" />
      </motion.div>
      
      <ul className="nav-items">
        {navItems.map((item, index) => (
          <motion.li 
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * (index + 1) }}
          >
            <Link
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <motion.span 
                className="nav-icon"
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
              >
                {item.icon}
              </motion.span>
              <span className="nav-label">{item.label}</span>
            </Link>
          </motion.li>
        ))}
      </ul>
      
      <motion.div 
        className="logout-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <motion.button 
          className="logout-button"
          onClick={handleLogout}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="logout-icon">🚪</span>
          <span className="logout-text">Logout</span>
        </motion.button>
      </motion.div>
    </motion.nav>
  );
};

export default Navbar; 