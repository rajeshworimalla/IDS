import { FC } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import DataTable from '../components/DataTable';
import '../styles/Activities.css';

const Activities: FC = () => {
  return (
    <div className="activities-page">
      <Navbar />
      <motion.main
        className="activities-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="page-header"
          initial={{ y: -20 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <h1>Activities</h1>
          <div className="header-stats">
            <motion.div
              className="stat-item"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <span className="stat-value">152</span>
              <span className="stat-label">Total Events</span>
            </motion.div>
            <motion.div
              className="stat-item"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <span className="stat-value">24</span>
              <span className="stat-label">Active Alerts</span>
            </motion.div>
            <motion.div
              className="stat-item"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="stat-value">98%</span>
              <span className="stat-label">System Health</span>
            </motion.div>
          </div>
        </motion.div>
        <DataTable />
      </motion.main>
    </div>
  );
};

export default Activities; 