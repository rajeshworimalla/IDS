import { FC, useState, useEffect } from 'react';
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
        // Show all packets
        const allPackets = Array.isArray(packetData) ? packetData : [];
        setPackets(allPackets);
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
      <main className="activities-content">
        <div className="page-header">
          <h1>Activities</h1>
          <div className="header-stats">
            <div className="stat-item">
              <span className="stat-value">{stats.totalEvents}</span>
              <span className="stat-label">Total Events</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.activeAlerts}</span>
              <span className="stat-label">Active Alerts</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.systemHealth}%</span>
              <span className="stat-label">System Health</span>
            </div>
          </div>
        </div>
        <DataTable data={packets} isLoading={isLoading} />
      </main>
    </div>
  );
};

export default Activities; 