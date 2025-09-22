import { FC, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { settingsService, SettingGroup, Setting } from '../services/settingsService';
import '../styles/Settings.css';

const Settings: FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<SettingGroup[]>([]);
  const [savedState, setSavedState] = useState(true);
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await settingsService.getSettings();
        setSettings(data);
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Failed to load settings. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleToggleChange = (groupId: string, settingId: string) => {
    setSettings(prev => 
      prev.map(group => {
        if (group.id === groupId) {
          return {
            ...group,
            settings: group.settings.map(setting => {
              if (setting.id === settingId && setting.type === 'toggle') {
                return {
                  ...setting,
                  value: !setting.value
                };
              }
              return setting;
            })
          };
        }
        return group;
      })
    );
    setSavedState(false);
  };

  const handleInputChange = (groupId: string, settingId: string, value: any) => {
    setSettings(prev => 
      prev.map(group => {
        if (group.id === groupId) {
          return {
            ...group,
            settings: group.settings.map(setting => {
              if (setting.id === settingId) {
                return {
                  ...setting,
                  value
                };
              }
              return setting;
            })
          };
        }
        return group;
      })
    );
    setSavedState(false);
  };

  const handleSave = async () => {
    try {
      setError(null);
      await settingsService.updateSettings(settings);
      setSavedState(true);
      setShowSaveMessage(true);
      setTimeout(() => setShowSaveMessage(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings. Please try again later.');
    }
  };

  const handleReset = async () => {
    if (window.confirm("Are you sure you want to reset settings to default values?")) {
      try {
        setError(null);
        await settingsService.resetSettings();
        const data = await settingsService.getSettings();
        setSettings(data);
        setSavedState(true);
      } catch (err) {
        console.error('Error resetting settings:', err);
        setError('Failed to reset settings. Please try again later.');
      }
    }
  };

  const renderSettingControl = (group: SettingGroup, setting: Setting) => {
    switch(setting.type) {
      case 'toggle':
        return (
          <motion.div 
            className="toggle-switch"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleToggleChange(group.id, setting.id)}
          >
            <motion.div 
              className={`toggle-track ${setting.value ? 'active' : ''}`}
              animate={{ backgroundColor: setting.value ? 'rgba(54, 153, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)' }}
              transition={{ duration: 0.2 }}
            >
              <motion.div 
                className="toggle-thumb"
                animate={{ 
                  left: setting.value ? 'calc(100% - 20px)' : '0',
                  backgroundColor: setting.value ? 'var(--accent-color)' : 'var(--text-secondary)' 
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </motion.div>
          </motion.div>
        );
      case 'dropdown':
        return (
          <motion.select 
            className="setting-dropdown"
            whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
            whileFocus={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
            value={setting.value}
            onChange={(e) => handleInputChange(group.id, setting.id, e.target.value)}
            transition={{ duration: 0.2 }}
          >
            {setting.options?.map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </motion.select>
        );
      case 'input':
        return (
          <motion.input
            type="text"
            className="setting-input"
            whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
            whileFocus={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', boxShadow: '0 0 0 2px rgba(54, 153, 255, 0.3)' }}
            value={setting.value}
            onChange={(e) => handleInputChange(group.id, setting.id, e.target.value)}
            transition={{ duration: 0.2 }}
          />
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="settings-page">
        <Navbar />
        <div className="settings-content">
          <div className="loading-message">Loading settings...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-page">
        <Navbar />
        <div className="settings-content">
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <Navbar />
      <motion.div 
        className="settings-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div 
          className="settings-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1>Settings</h1>
          <p>Configure your IDS system preferences</p>
        </motion.div>

        <motion.div 
          className="save-message"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: showSaveMessage ? 1 : 0, y: showSaveMessage ? 0 : -10 }}
          transition={{ duration: 0.3 }}
        >
          Settings saved successfully!
        </motion.div>

        <div className="settings-container">
          <motion.div 
            className="settings-sidebar"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {settings.map((group, index) => (
              <motion.button
                key={group.id}
                className={`tab-button ${activeTab === group.id ? 'active' : ''}`}
                onClick={() => setActiveTab(group.id)}
                variants={itemVariants}
                animate={activeTab === group.id ? "active" : "inactive"}
                whileHover="hover"
                whileTap="tap"
                custom={index}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                {group.title}
              </motion.button>
            ))}
          </motion.div>

          <div className="settings-main">
            <AnimatePresence mode="wait">
              {settings.map(group => activeTab === group.id && (
                <motion.div 
                  key={group.id} 
                  className="settings-group active"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2>{group.title}</h2>
                  <motion.div 
                    className="settings-items"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {group.settings.map((setting, idx) => (
                      <motion.div 
                        key={setting.id}
                        className="setting-item"
                        variants={itemVariants}
                        custom={idx}
                        whileHover={{
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          transition: { duration: 0.2 } 
                        }}
                      >
                        <div className="setting-info">
                          <h3>{setting.name}</h3>
                          <p>{setting.description}</p>
                        </div>
                        <div className="setting-control">
                          {renderSettingControl(group, setting)}
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>

                  <motion.div 
                    className="settings-actions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    <motion.button 
                      className="button reset"
                      whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleReset}
                    >
                      Reset
                    </motion.button>
                    <motion.button 
                      className={`button save ${!savedState ? 'unsaved' : ''}`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSave}
                      animate={!savedState ? 
                        { scale: [1, 1.03, 1], transition: { repeat: 0, duration: 0.5 } } :
                        {}
                      }
                    >
                      {!savedState ? 'Save Changes' : 'Saved'}
                    </motion.button>
                  </motion.div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.05,
      delayChildren: 0.1
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

/*
const tabVariants = {
  inactive: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    color: 'var(--text-secondary)',
    scale: 1
  },
  active: {
    backgroundColor: 'rgba(54, 153, 255, 0.1)',
    color: 'var(--accent-color)',
    scale: 1.02
  },
  hover: {
    scale: 1.05,
    backgroundColor: 'rgba(255, 255, 255, 0.08)'
  },
  tap: { scale: 0.98 }
};
*/

export default Settings; 