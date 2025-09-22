import { FC, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import DataTable from '../components/DataTable';
import { packetService } from '../services/packetService';
import '../styles/Activities.css';

interface ActivityStats {
  totalEvents: number;
  activeAlerts: number;
  systemHealth: number;
}

const Activities: FC = () => {
  const [stats, setStats] = useState<ActivityStats>({
    totalEvents: 0,
    activeAlerts: 0,
    systemHealth: 0
  });
  const [packets, setPackets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [packetStats, packetData] = await Promise.all([
          packetService.getPacketStats(),
          packetService.getPackets()
        ]);

        setStats({
          totalEvents: packetStats.totalPackets,
          activeAlerts: packetStats.criticalCount + packetStats.mediumCount,
          systemHealth: calculateSystemHealth(packetStats)
        });
        setPackets(packetData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const calculateSystemHealth = (packetStats: any) => {
    const total = packetStats.totalPackets || 1;
    const normalPackets = packetStats.normalCount;
    return Math.round((normalPackets / total) * 100);
  };

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
              <span className="stat-value">{stats.totalEvents}</span>
              <span className="stat-label">Total Events</span>
            </motion.div>
            <motion.div
              className="stat-item"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <span className="stat-value">{stats.activeAlerts}</span>
              <span className="stat-label">Active Alerts</span>
            </motion.div>
            <motion.div
              className="stat-item"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="stat-value">{stats.systemHealth}%</span>
              <span className="stat-label">System Health</span>
            </motion.div>
          </div>
        </motion.div>
        <DataTable data={packets} isLoading={isLoading} />
      </motion.main>
    </div>
  );
};

export default Activities; 