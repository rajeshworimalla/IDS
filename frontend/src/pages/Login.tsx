import { FC, useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../services/auth';
import '../styles/Auth.css';

const Login: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [lockRemaining, setLockRemaining] = useState<number | null>(null);

  // Check if already authenticated and redirect if needed
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Check for success message from registration
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the state to prevent showing the message again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    if (error) setError('');
    if (successMessage) setSuccessMessage('');
    if (lockMessage) setLockMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.email || !formData.password) {
      setError('Please fill in all required fields');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    setLockMessage('');
    
    try {
      // Call the auth service to login
      await authService.login({
        email: formData.email,
        password: formData.password
      });
      
      // Dispatch auth change event to update app state
      const authChangeEvent = new Event('auth-change');
      window.dispatchEvent(authChangeEvent);
      
      // Navigate to dashboard
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 100);
      
    } catch (err: any) {
      const msg = String(err?.message || 'Login failed');
      // Parse remaining seconds if included
      const remainingMatch = msg.match(/(\d+)s/);
      if (msg.toLowerCase().includes('too many failed attempts') || remainingMatch) {
        setLockMessage(msg);
        const seconds = remainingMatch ? parseInt(remainingMatch[1], 10) : 60;
        setLockRemaining(seconds);
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        when: "beforeChildren",
        staggerChildren: 0.1,
        duration: 0.3
      } 
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  // Countdown effect for lockRemaining
  useEffect(() => {
    if (lockRemaining && lockRemaining > 0) {
      const t = setInterval(() => {
        setLockRemaining(prev => (prev && prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(t);
    }
  }, [lockRemaining]);

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="auth-shapes">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="shape"
              initial={{
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                scale: Math.random() * 0.5 + 0.5
              }}
              animate={{
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                rotate: Math.random() * 360,
                transition: {
                  duration: Math.random() * 20 + 10,
                  repeat: Infinity,
                }
              }}
            />
          ))}
        </div>
      </div>
      
      <motion.div 
        className="auth-container"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className="auth-card" variants={itemVariants}>
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your account</p>
          
          {lockMessage && (
            <motion.div 
              className="auth-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {lockMessage}
            </motion.div>
          )}

          {error && (
            <motion.div 
              className="auth-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.div>
          )}
          
          {successMessage && (
            <motion.div 
              className="auth-success"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {successMessage}
            </motion.div>
          )}
          
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>
            
            <div className="form-group remember-me">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <span className="checkmark"></span>
                Remember me
              </label>
            </div>
            
            <motion.button
              type="submit"
              className="auth-button"
              disabled={isLoading || (lockRemaining !== null && lockRemaining > 0)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? 'Signing in...' : (lockRemaining && lockRemaining > 0 ? `Locked (${lockRemaining}s)` : 'Sign In')}
            </motion.button>
          </form>
          
          <div className="auth-footer">
            <p>
              Don't have an account?{' '}
              <Link to="/signup" className="auth-link">
                Sign up
              </Link>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login; 