import { FC, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import Navbar from '../components/Navbar';
import { packetService } from '../services/packetService';
import '../styles/Dashboard.css';

const Dashboard: FC = () => {
  const [activeTab, setActiveTab] = useState('status');
  const [stats, setStats] = useState({
    totalPackets: 0,
    totalBytes: 0,
    avgBytes: 0,
    criticalCount: 0,
    mediumCount: 0,
    normalCount: 0,
    maliciousCount: 0,
    criticalPercentage: 0,
    mediumPercentage: 0,
    normalPercentage: 0,
    maliciousPercentage: 0
  });
  const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [lineData, setLineData] = useState<{ time: string; value1: number; value2: number }[]>([]);
  const [barData, setBarData] = useState<{ name: string; value: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        // Fetch packet statistics
        const packetStats = await packetService.getPacketStats();
        setStats(packetStats);

        // Fetch status distribution for pie chart
        const statusData = await packetService.getStatusDistribution();
        setPieData(statusData);

        // Fetch network load for line chart
        const networkData = await packetService.getNetworkLoad();
        setLineData(networkData);

        // Fetch top hosts for bar chart
        const topHosts = await packetService.getTopHosts();
        setBarData(topHosts);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to fetch dashboard data. Please try again later.');
      }
    };

    fetchData();
    // Set up polling interval to refresh data every 5 seconds
    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard-page">
      <Navbar />
      <motion.main
        className="dashboard-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {error && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}
        
        <div className="dashboard-header">
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => setActiveTab('status')}
            >
              Status
            </button>
            <button 
              className={`tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
          </div>
        </div>

        <motion.div 
          className="stats-grid"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className="stats-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <span className="stats-icon">📊</span>
            <div className="stats-info">
              <span className="stats-value">{stats.totalPackets}</span>
              <span className="stats-title">TOTAL PACKETS</span>
            </div>
          </motion.div>
          <motion.div
            className="stats-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="stats-icon">⚠️</span>
            <div className="stats-info">
              <span className="stats-value">{stats.criticalCount}</span>
              <span className="stats-title">CRITICAL</span>
            </div>
          </motion.div>
          <motion.div
            className="stats-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <span className="stats-icon">🔍</span>
            <div className="stats-info">
              <span className="stats-value">{stats.maliciousCount}</span>
              <span className="stats-title">MALICIOUS</span>
            </div>
          </motion.div>
          <motion.div
            className="stats-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <span className="stats-icon">📦</span>
            <div className="stats-info">
              <span className="stats-value">{Math.round(stats.avgBytes)}</span>
              <span className="stats-title">AVG BYTES</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div 
          className="charts-grid"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="chart-card">
            <h3>EVENT DISTRIBUTION</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>NETWORK LOAD</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="#8a8d9f" />
                <YAxis stroke="#8a8d9f" />
                <Tooltip />
                <Line type="monotone" dataKey="value1" stroke="#3699ff" strokeWidth={2} dot={false} name="TCP" />
                <Line type="monotone" dataKey="value2" stroke="#00d0ff" strokeWidth={2} dot={false} name="UDP" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>TOP HOSTS</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#8a8d9f" />
                <YAxis dataKey="name" type="category" stroke="#8a8d9f" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#3699ff" barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </motion.main>
    </div>
  );
};

export default Dashboard; 