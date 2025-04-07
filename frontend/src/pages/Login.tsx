import { FC, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import '../styles/Auth.css';

const Login: FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if already authenticated and redirect if needed
  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') === 'true') {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.email || !formData.password) {
      setError('Please fill in all required fields');
      return;
    }
    
    setIsLoading(true);
    // Simulate API call
    try {
      // In a real app, this would be an API call to authenticate
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Set authentication status in localStorage
      localStorage.setItem('isAuthenticated', 'true');
      
      // Dispatch a custom event to notify the app about authentication change
      window.dispatchEvent(new Event('auth-change'));
      
      // If "remember me" is checked, we might set a longer expiration
      if (formData.rememberMe) {
        // This would typically involve storing a refresh token or setting a longer session
        console.log('Remember me enabled');
      }
      
      // If successful, redirect to dashboard
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError('Invalid email or password');
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
                  repeatType: "reverse",
                  ease: "linear"
                }
              }}
              style={{
                backgroundColor: `rgba(${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 255)}, 0.1)`,
                width: `${Math.random() * 300 + 50}px`,
                height: `${Math.random() * 300 + 50}px`,
                borderRadius: `${Math.random() * 50}%`
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
        

        <motion.h2 className="auth-title" variants={itemVariants}>
          Welcome Back
        </motion.h2>

        <motion.p className="auth-subtitle" variants={itemVariants}>
          Log in to access your security dashboard
        </motion.p>

        {error && (
          <motion.div 
            className="auth-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {error}
          </motion.div>
        )}

        <motion.form 
          className="auth-form" 
          onSubmit={handleSubmit}
          variants={itemVariants}
        >
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <motion.input 
              type="email" 
              id="email" 
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleInputChange}
              whileFocus={{ boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
              required
            />
          </div>

          <div className="form-group">
            <div className="password-label-group">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="forgot-password">
                Forgot password?
              </Link>
            </div>
            <motion.input 
              type="password" 
              id="password" 
              name="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleInputChange}
              whileFocus={{ boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
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
              />
              <span className="checkmark"></span>
              Remember me
            </label>
          </div>

          <motion.button 
            type="submit" 
            className={`auth-button ${isLoading ? 'loading' : ''}`}
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoading ? (
              <div className="spinner"></div>
            ) : 'Log In'}
          </motion.button>
        </motion.form>

        <motion.div className="auth-footer" variants={itemVariants}>
          <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login; 