import { FC, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import '../styles/Dashboard.css';

interface StatsCard {
  id: string;
  title: string;
  value: number;
  icon: string;
}

const Dashboard: FC = () => {
  const [activeTab, setActiveTab] = useState('status');
  
  const statsCards: StatsCard[] = [
    { id: 'alarms', title: 'ALARME', value: 1, icon: '🔔' },
    { id: 'critical', title: 'KRITISCHE', value: 0, icon: '❌' },
    { id: 'warnings', title: 'WARNUNGEN', value: 24, icon: '⚠️' },
    { id: 'info', title: 'INFOS', value: 14, icon: 'ℹ️' },
  ];

  const pieData = [
    { name: 'Critical', value: 20, color: '#ff4d4f' },
    { name: 'Warning', value: 45, color: '#faad14' },
    { name: 'Info', value: 35, color: '#1890ff' },
  ];

  const lineData = [
    { time: '00:00', value1: 30, value2: 20 },
    { time: '04:00', value1: 45, value2: 25 },
    { time: '08:00', value1: 35, value2: 35 },
    { time: '12:00', value1: 55, value2: 40 },
    { time: '16:00', value1: 40, value2: 30 },
    { time: '20:00', value1: 50, value2: 45 },
  ];

  const barData = [
    { name: '192.168.1.1', value: 85 },
    { name: '192.168.1.2', value: 75 },
    { name: '192.168.1.3', value: 65 },
    { name: '192.168.1.4', value: 55 },
    { name: '192.168.1.5', value: 45 },
  ];

  return (
    <div className="dashboard">
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

      <div className="stats-grid">
        {statsCards.map((card) => (
          <div key={card.id} className="stats-card">
            <span className="stats-icon">{card.icon}</span>
            <div className="stats-info">
              <span className="stats-value">{card.value}</span>
              <span className="stats-title">{card.title}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>EREIGNISVERTEILUNG</h3>
          <div className="chart-container">
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
        </div>

        <div className="chart-card">
          <h3>LAST PROZESSNETZE</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="#8a8d9f" />
                <YAxis stroke="#8a8d9f" />
                <Tooltip />
                <Line type="monotone" dataKey="value1" stroke="#3699ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="value2" stroke="#00d0ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h3>TOP HOSTS</h3>
          <div className="chart-container">
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
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 