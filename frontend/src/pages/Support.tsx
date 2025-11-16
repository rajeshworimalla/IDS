import React, { FC, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { supportService, FAQ } from '../services/supportService';
import '../styles/Support.css';

const Support: FC = () => {
  const [activeTab, setActiveTab] = useState<'faq' | 'contact' | 'resources'>('faq');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [faqsError, setFaqsError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical'
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch FAQ data on mount
  useEffect(() => {
    const fetchFAQ = async () => {
      try {
        setFaqsLoading(true);
        setFaqsError(null);
        const data = await supportService.getFAQ();
        setFaqs(data);
      } catch (error: any) {
        console.error('Error fetching FAQ:', error);
        setFaqsError(error?.message || 'Failed to load FAQ');
      } finally {
        setFaqsLoading(false);
      }
    };

    fetchFAQ();
  }, []);

  const resources = [
    {
      title: 'User Manual',
      description: 'Comprehensive guide to using all features of the system',
      link: '#',
      icon: '📖'
    },
    {
      title: 'Video Tutorials',
      description: 'Step-by-step video guides for common tasks',
      link: '#',
      icon: '🎬'
    },
    {
      title: 'Knowledge Base',
      description: 'Articles and solutions to common issues',
      link: '#',
      icon: '📚'
    },
    {
      title: 'API Documentation',
      description: 'Technical documentation for developers',
      link: '#',
      icon: '🔧'
    },
    {
      title: 'Threat Intelligence',
      description: 'Latest reports and analysis on cybersecurity threats',
      link: '#',
      icon: '🔍'
    },
    {
      title: 'Community Forums',
      description: 'Connect with other users and share best practices',
      link: '#',
      icon: '👥'
    }
  ];

  const handleFaqClick = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      await supportService.createTicket({
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
        priority: formData.priority
      });

      setSubmitSuccess(true);
      // Reset form
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: '',
        priority: 'medium'
      });

      // Clear success message after 5 seconds
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (error: any) {
      console.error('Error submitting ticket:', error);
      setSubmitError(error?.response?.data?.message || error?.message || 'Failed to submit support request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="support-page">
      <Navbar />
      <div className="support-content">
        <motion.div 
          className="support-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1>Support Center</h1>
          <p>Find answers, resources, and get help from our team</p>
        </motion.div>

        <div className="support-tabs">
          <button 
            className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}
            onClick={() => setActiveTab('faq')}
          >
            Frequently Asked Questions
          </button>
          <button 
            className={`tab-button ${activeTab === 'contact' ? 'active' : ''}`}
            onClick={() => setActiveTab('contact')}
          >
            Contact Support
          </button>
          <button 
            className={`tab-button ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveTab('resources')}
          >
            Resources
          </button>
        </div>

        <div className="support-container">
          {activeTab === 'faq' && (
            <motion.div 
              className="faq-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <h2>Frequently Asked Questions</h2>
              {faqsLoading && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p>Loading FAQ...</p>
                </div>
              )}
              {faqsError && (
                <div style={{ 
                  padding: '1rem', 
                  margin: '1rem 0', 
                  backgroundColor: '#fee', 
                  color: '#c33',
                  borderRadius: '4px'
                }}>
                  Error: {faqsError}
                </div>
              )}
              {!faqsLoading && !faqsError && faqs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p>No FAQ items available.</p>
                </div>
              )}
              <div className="faq-list">
                {!faqsLoading && faqs.map((faq, index) => (
                  <motion.div 
                    key={index}
                    className={`faq-item ${expandedFaq === index ? 'expanded' : ''}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <div 
                      className="faq-question"
                      onClick={() => handleFaqClick(index)}
                    >
                      <h3>{faq.question}</h3>
                      <span className="faq-icon">
                        {expandedFaq === index ? '−' : '+'}
                      </span>
                    </div>
                    {expandedFaq === index && (
                      <motion.div 
                        className="faq-answer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                      >
                        <p>{faq.answer}</p>
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'contact' && (
            <motion.div 
              className="contact-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <h2>Contact Support</h2>
              <div className="contact-info">
                <div className="contact-methods">
                  <div className="contact-method">
                    <div className="method-icon">📧</div>
                    <div className="method-details">
                      <h3>Email Support</h3>
                      <p>support@ids-security.com</p>
                      <p>Response time: Within 24 hours</p>
                    </div>
                  </div>
                  <div className="contact-method">
                    <div className="method-icon">☎️</div>
                    <div className="method-details">
                      <h3>Phone Support</h3>
                      <p>+1 (555) 123-4567</p>
                      <p>Available: Mon-Fri, 9AM-5PM EST</p>
                    </div>
                  </div>
                  <div className="contact-method">
                    <div className="method-icon">💬</div>
                    <div className="method-details">
                      <h3>Live Chat</h3>
                      <p>Available on weekdays</p>
                      <p>Hours: 8AM-8PM EST</p>
                    </div>
                  </div>
                </div>

                <form className="contact-form" onSubmit={handleSubmit}>
                  <h3>Submit a Support Request</h3>
                  {submitSuccess && (
                    <div style={{ 
                      padding: '1rem', 
                      marginBottom: '1rem', 
                      backgroundColor: '#efe', 
                      color: '#3c3',
                      borderRadius: '4px'
                    }}>
                      ✓ Your support request has been submitted successfully. We will get back to you soon.
                    </div>
                  )}
                  {submitError && (
                    <div style={{ 
                      padding: '1rem', 
                      marginBottom: '1rem', 
                      backgroundColor: '#fee', 
                      color: '#c33',
                      borderRadius: '4px'
                    }}>
                      Error: {submitError}
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="name">Name</label>
                      <input 
                        type="text" 
                        id="name" 
                        name="name" 
                        value={formData.name}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="email">Email</label>
                      <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        value={formData.email}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="subject">Subject</label>
                    <input 
                      type="text" 
                      id="subject" 
                      name="subject" 
                      value={formData.subject}
                      onChange={handleInputChange}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="message">Message</label>
                    <textarea 
                      id="message" 
                      name="message" 
                      rows={5} 
                      value={formData.message}
                      onChange={handleInputChange}
                      required 
                    ></textarea>
                  </div>
                  <div className="form-group">
                    <label htmlFor="priority">Priority</label>
                    <select 
                      id="priority" 
                      name="priority" 
                      value={formData.priority}
                      onChange={handleInputChange}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <button 
                    type="submit" 
                    className="submit-button" 
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {activeTab === 'resources' && (
            <motion.div 
              className="resources-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <h2>Resources & Documentation</h2>
              <div className="resources-grid">
                {resources.map((resource, index) => (
                  <motion.a 
                    href={resource.link} 
                    className="resource-card"
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <div className="resource-icon">{resource.icon}</div>
                    <h3>{resource.title}</h3>
                    <p>{resource.description}</p>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Support; 