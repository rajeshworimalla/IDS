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
  const [statsCards, setStatsCards] = useState([
    { id: 'alarms', title: 'ALARMS', value: 0, icon: '🔔' },
    { id: 'critical', title: 'CRITICAL', value: 0, icon: '❌' },
    { id: 'warnings', title: 'WARNINGS', value: 0, icon: '⚠️' },
    { id: 'info', title: 'INFO', value: 0, icon: 'ℹ️' },
  ]);
  const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [lineData, setLineData] = useState<{ time: string; value1: number; value2: number }[]>([]);
  const [barData, setBarData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch status distribution for pie chart
        const statusData = await packetService.getStatusDistribution();
        setPieData(statusData);

        // Update stats cards
        setStatsCards([
          { id: 'alarms', title: 'ALARMS', value: statusData.reduce((sum, item) => sum + item.value, 0), icon: '🔔' },
          { id: 'critical', title: 'CRITICAL', value: statusData.find(item => item.name === 'Critical')?.value || 0, icon: '❌' },
          { id: 'warnings', title: 'WARNINGS', value: statusData.find(item => item.name === 'Warning')?.value || 0, icon: '⚠️' },
          { id: 'info', title: 'INFO', value: statusData.find(item => item.name === 'Info')?.value || 0, icon: 'ℹ️' },
        ]);

        // Fetch network load for line chart
        const networkData = await packetService.getNetworkLoad();
        setLineData(networkData);

        // Fetch top hosts for bar chart
        const topHosts = await packetService.getTopHosts();
        setBarData(topHosts);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
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
          {statsCards.map((card, index) => (
            <motion.div
              key={card.id}
              className="stats-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (index + 1) }}
            >
              <span className="stats-icon">{card.icon}</span>
              <div className="stats-info">
                <span className="stats-value">{card.value}</span>
                <span className="stats-title">{card.title}</span>
              </div>
            </motion.div>
          ))}
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