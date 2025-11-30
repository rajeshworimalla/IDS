import { FC, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import Navbar from '../components/Navbar';
import { packetService } from '../services/packetService';
import { authService } from '../services/auth';
import { settingsService } from '../services/settingsService';
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
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      // Fetch packet statistics with error handling
      try {
        const packetStats = await packetService.getPacketStats();
        if (packetStats && typeof packetStats === 'object') {
          setStats(packetStats);
        }
      } catch (err) {
        console.warn('Error fetching packet stats:', err);
        // Continue with other data
      }

      // Fetch status distribution for pie chart
      try {
        const statusData = await packetService.getStatusDistribution();
        if (Array.isArray(statusData)) {
          setPieData(statusData);
        }
      } catch (err) {
        console.warn('Error fetching status distribution:', err);
        // Continue with other data
      }

      // Fetch network load for line chart
      try {
        const networkData = await packetService.getNetworkLoad();
        if (Array.isArray(networkData)) {
          setLineData(networkData);
        }
      } catch (err) {
        console.warn('Error fetching network load:', err);
        // Continue with other data
      }

      // Fetch top hosts for bar chart
      try {
        const topHosts = await packetService.getTopHosts();
        if (Array.isArray(topHosts)) {
          setBarData(topHosts);
        }
      } catch (err) {
        console.warn('Error fetching top hosts:', err);
        // Continue - not critical
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
      // Don't set error state to prevent UI crashes, just log it
    }
  };

  useEffect(() => {
    // Initial fetch with error handling
    fetchData().catch(err => {
      console.error('Initial fetch failed:', err);
      // Don't crash, just log
    });

    // Set up socket connection for real-time updates
    try {
      const token = authService.getToken();
      if (token) {
        const socket = io('http://localhost:5001', {
          auth: { token },
          withCredentials: true,
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 20000,
        });

        socket.on('connect', () => {
          console.log('[Dashboard] Socket connected');
        });

        socket.on('connect_error', (err) => {
          console.warn('[Dashboard] Socket connection error:', err);
          // Don't crash, just log
        });

        socket.on('error', (err) => {
          console.warn('[Dashboard] Socket error:', err);
          // Don't crash, just log
        });

        // Listen for new packets and refresh stats
        socket.on('new-packet', () => {
          // Refresh stats when new packet arrives (non-blocking)
          fetchData().catch((err: any) => {
            console.warn('[Dashboard] Error refreshing on new packet:', err);
          });
        });

        // Listen for intrusion alerts - CRITICAL for attack detection
        socket.on('intrusion-detected', (alert: any) => {
          console.log('[Dashboard] 🚨 INTRUSION DETECTED:', alert);
          // Immediately refresh stats to show attack
          fetchData().catch((err: any) => {
            console.warn('[Dashboard] Error refreshing on intrusion:', err);
          });
        });

        socketRef.current = socket;
      }
    } catch (err) {
      console.warn('[Dashboard] Error setting up socket:', err);
      // Continue without socket - polling will still work
    }

    // Set up polling interval to refresh stats every 5 seconds
    try {
      refreshIntervalRef.current = setInterval(() => {
      fetchData().catch((err: any) => {
        console.warn('[Dashboard] Polling refresh error:', err);
      });
      }, 5000);
    } catch (err) {
      console.warn('[Dashboard] Error setting up polling:', err);
    }

    // Cleanup
    return () => {
      try {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      } catch (err) {
        console.warn('[Dashboard] Cleanup error:', err);
      }
    };
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
              <span className="stats-title">ATTACKS DETECTED</span>
            </div>
          </motion.div>
          {/* <motion.div
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
          </motion.div> */}
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