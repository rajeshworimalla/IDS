import { FC, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../services/auth';
import '../styles/Auth.css';

const Signup: FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    if (error) setError('');
  };

  const validateStep1 = () => {
    if (!formData.name || !formData.email) {
      setError('Please fill in all required fields');
      return false;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    
    return true;
  };

  const validateStep2 = () => {
    if (!formData.password) {
      setError('Please enter a password');
      return false;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    if (!formData.agreeTerms) {
      setError('Please agree to the terms and conditions');
      return false;
    }
    
    return true;
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep2()) {
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Starting registration process...');
      
      // Call the auth service to register
      const response = await authService.register({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });
      
      console.log('Registration successful:', response);
      
      // If successful, redirect to login with success message
      navigate('/login', { 
        state: { 
          message: 'Registration successful! Please log in with your credentials.' 
        } 
      });
      
    } catch (err: any) {
      console.error('Registration error:', err);
      // Show the actual error message from the service
      const errorMessage = err.message || err.response?.data?.message || 'An error occurred during registration. Please try again.';
      setError(errorMessage);
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

  const slideVariants = {
    enter: (direction: number) => {
      return {
        x: direction > 0 ? 250 : -250,
        opacity: 0
      };
    },
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => {
      return {
        x: direction < 0 ? 250 : -250,
        opacity: 0
      };
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
        
        <motion.h2 className="auth-title" variants={itemVariants}>
          Create Account
        </motion.h2>

        <motion.p className="auth-subtitle" variants={itemVariants}>
          Join our security platform
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

        <div className="auth-steps">
          <div className={`step-indicator ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="step-connector"></div>
          <div className={`step-indicator ${step >= 2 ? 'active' : ''}`}>2</div>
        </div>

        {step === 1 ? (
          <motion.form 
            className="auth-form"
            key="step1" 
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <motion.input 
                type="text" 
                id="name" 
                name="name"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={handleInputChange}
                whileFocus={{ boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
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

            <motion.button 
              type="button" 
              className="auth-button"
              onClick={handleNextStep}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Continue
            </motion.button>
          </motion.form>
        ) : (
          <motion.form 
            className="auth-form" 
            onSubmit={handleSubmit}
            key="step2"
            custom={-1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <motion.input 
                type="password" 
                id="password" 
                name="password"
                placeholder="Create a password"
                value={formData.password}
                onChange={handleInputChange}
                whileFocus={{ boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
                required
              />
              <small className="password-hint">Must be at least 8 characters</small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <motion.input 
                type="password" 
                id="confirmPassword" 
                name="confirmPassword"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                whileFocus={{ boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
                required
              />
            </div>

            <div className="form-group terms-group">
              <label className="checkbox-container">
                <input 
                  type="checkbox" 
                  name="agreeTerms"
                  checked={formData.agreeTerms}
                  onChange={handleInputChange}
                />
                <span className="checkmark"></span>
                I agree to the <Link to="/terms" className="terms-link">Terms of Service</Link> and <Link to="/privacy" className="terms-link">Privacy Policy</Link>
              </label>
            </div>

            <div className="form-actions">
              <motion.button 
                type="button" 
                className="auth-button secondary"
                onClick={() => setStep(1)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Back
              </motion.button>
              
              <motion.button 
                type="submit" 
                className={`auth-button ${isLoading ? 'loading' : ''}`}
                disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isLoading ? (
                  <div className="spinner"></div>
                ) : 'Create Account'}
              </motion.button>
            </div>
          </motion.form>
        )}

        <motion.div className="auth-footer" variants={itemVariants}>
          <p>Already have an account? <Link to="/login">Log in</Link></p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Signup; 