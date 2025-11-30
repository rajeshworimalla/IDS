import { FC, useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  const [alertStats, setAlertStats] = useState({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0
  });
  const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [lineData, setLineData] = useState<{ time: string; value1: number; value2: number }[]>([]);
  const [barData, setBarData] = useState<{ name: string; value: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);
  const packetRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = async (skipCharts = false) => {
    try {
      setError(null);
      // Fetch packet statistics with error handling (always fetch stats)
      // This gets ALL packets stats - same source as Monitoring uses for alerts
      try {
        const packetStats = await packetService.getPacketStats();
        if (packetStats && typeof packetStats === 'object') {
          // Ensure we're using the same data source
          setStats({
            ...packetStats,
            // Make sure maliciousCount matches what Monitoring shows
            maliciousCount: packetStats.maliciousCount || 0,
            criticalCount: packetStats.criticalCount || 0,
            mediumCount: packetStats.mediumCount || 0,
            normalCount: packetStats.normalCount || 0,
            totalPackets: packetStats.totalPackets || 0
          });
        }
      } catch (err) {
        console.warn('Error fetching packet stats:', err);
        // Continue with other data
      }
      
      // Fetch alert stats to ensure consistency with Monitoring page (SAME DATA SOURCE)
      try {
        const alertStatsData = await packetService.getAlertStats({
          severity: ['critical', 'high', 'medium', 'low'],
          status: []
        });
        if (alertStatsData && typeof alertStatsData === 'object') {
          setAlertStats(alertStatsData);
          // Sync Dashboard stats with Monitoring alert stats for consistency
          setStats(prev => ({
            ...prev,
            // Use alert stats as primary source to match Monitoring page
            maliciousCount: alertStatsData.total || prev.maliciousCount,
            criticalCount: alertStatsData.critical || prev.criticalCount,
            // Keep packet stats for total packets count
            totalPackets: prev.totalPackets
          }));
        }
      } catch (err) {
        console.warn('Error fetching alert stats for consistency:', err);
        // Continue - not critical
      }

      // Only fetch chart data if not skipping (for performance)
      if (!skipCharts) {
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
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
      // Don't set error state to prevent UI crashes, just log it
    }
  };

  useEffect(() => {
    // Page Visibility API - pause updates when tab is hidden
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      if (isVisibleRef.current) {
        // Tab became visible - refresh data
        fetchData(false).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial fetch with error handling (fetch charts on initial load)
    fetchData(false).catch(err => {
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

        // Listen for new packets - DISABLED for performance (only update on intrusions)
        // socket.on('new-packet', () => {
        //   // Disabled to reduce lag - stats will update via polling only
        // });

        // Listen for intrusion alerts - CRITICAL for attack detection (always update)
        socket.on('intrusion-detected', (alert: any) => {
          console.log('[Dashboard] 🚨 INTRUSION DETECTED:', alert);
          // Always refresh for intrusions, even if tab is hidden
          fetchData(true).catch((err: any) => {
            console.warn('[Dashboard] Error refreshing on intrusion:', err);
          });
        });

        socketRef.current = socket;
      }
    } catch (err) {
      console.warn('[Dashboard] Error setting up socket:', err);
      // Continue without socket - polling will still work
    }

    // Set up polling interval to refresh stats every 120 seconds (minimal updates)
    try {
      refreshIntervalRef.current = setInterval(() => {
        // Only poll when tab is visible
        if (isVisibleRef.current) {
          fetchData(true).catch((err: any) => { // Skip charts on polling for performance
            console.warn('[Dashboard] Polling refresh error:', err);
          });
        }
      }, 120000); // Increased to 120 seconds (2 minutes) for minimal background updates
    } catch (err) {
      console.warn('[Dashboard] Error setting up polling:', err);
    }

    // Cleanup
    return () => {
      try {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
        if (packetRefreshTimeoutRef.current) {
          clearTimeout(packetRefreshTimeoutRef.current);
          packetRefreshTimeoutRef.current = null;
        }
      } catch (err) {
        console.warn('[Dashboard] Cleanup error:', err);
      }
    };
  }, []);

  // Memoize chart data to prevent unnecessary re-renders
  const memoizedPieData = useMemo(() => pieData, [pieData]);
  const memoizedLineData = useMemo(() => lineData, [lineData]);
  const memoizedBarData = useMemo(() => barData, [barData]);

  return (
    <div className="dashboard-page">
      <Navbar />
      <main className="dashboard-content">
        {error && (
          <div className="error-message">
            {error}
          </div>
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

        <div className="stats-grid">
          <div className="stats-card">
            <span className="stats-icon">📊</span>
            <div className="stats-info">
              <span className="stats-value">{stats.totalPackets}</span>
              <span className="stats-title">TOTAL PACKETS</span>
              <span style={{ fontSize: '9px', color: '#666', display: 'block', marginTop: '2px' }}>
                (All captured)
              </span>
            </div>
          </div>
          <div className="stats-card">
            <span className="stats-icon">⚠️</span>
            <div className="stats-info">
              <span className="stats-value">{alertStats.critical || stats.criticalCount}</span>
              <span className="stats-title">CRITICAL</span>
            </div>
          </div>
          <div className="stats-card">
            <span className="stats-icon">🔍</span>
            <div className="stats-info">
              <span className="stats-value">{alertStats.total || stats.maliciousCount}</span>
              <span className="stats-title">ATTACKS DETECTED</span>
            </div>
          </div>
        </div>

        <div className="charts-grid">
          <div className="chart-card">
            <h3>EVENT DISTRIBUTION</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={memoizedPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {memoizedPieData.map((entry, index) => (
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
              <LineChart data={memoizedLineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="#8a8d9f" />
                <YAxis stroke="#8a8d9f" />
                <Tooltip />
                <Line type="monotone" dataKey="value1" stroke="#3699ff" strokeWidth={2} dot={false} isAnimationActive={false} name="TCP" />
                <Line type="monotone" dataKey="value2" stroke="#00d0ff" strokeWidth={2} dot={false} isAnimationActive={false} name="UDP" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>TOP HOSTS</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={memoizedBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#8a8d9f" />
                <YAxis dataKey="name" type="category" stroke="#8a8d9f" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#3699ff" barSize={10} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard; 