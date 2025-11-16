import api from './api';
import { API_BASE_URL } from '../config/api';

const API_URL = `${API_BASE_URL}/api/packets`;

export interface PacketData {
  date: Date;
  start_ip: string;
  end_ip: string;
  protocol: string;
  frequency: number;
  status: 'critical' | 'medium' | 'normal';
  description: string;
  start_bytes: number;
  end_bytes: number;
  is_malicious: boolean;
  attack_type: string;
  confidence: number;
}

export interface PacketStats {
  totalPackets: number;
  totalBytes: number;
  avgBytes: number;
  criticalCount: number;
  mediumCount: number;
  normalCount: number;
  maliciousCount: number;
  criticalPercentage: number;
  mediumPercentage: number;
  normalPercentage: number;
  maliciousPercentage: number;
}

export interface ThreatAlert {
  _id: string;
  id: string;
  date: Date;
  source: string;
  destination: string;
  protocol: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'closed' | 'in-progress' | 'investigating' | 'mitigated' | 'resolved';
  description: string;
  confidence: number;
  attack_type: string;
  attack_type_probabilities?: {
    normal?: number;
    dos?: number;
    probe?: number;
    r2l?: number;
    u2r?: number;
  };
  type: string;
  timestamp: Date;
}

export interface AlertStats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export const packetService = {
  async getPackets(): Promise<PacketData[]> {
    const response = await api.get(`${API_URL}/all`);
    return response.data;
  },

  async getPacketStats(): Promise<PacketStats> {
    const response = await api.get(`${API_URL}/stats`);
    return response.data;
  },

  async getPacketsByTimeRange(from: Date, to: Date): Promise<PacketData[]> {
    const response = await api.get(`${API_URL}/filter`, {
      params: { from, to }
    });
    return response.data;
  },

  async getTopHosts(): Promise<{ name: string; value: number }[]> {
    const packets = await this.getPackets();
    const hostCounts: { [key: string]: number } = {};
    
    packets.forEach(packet => {
      hostCounts[packet.start_ip] = (hostCounts[packet.start_ip] || 0) + 1;
      hostCounts[packet.end_ip] = (hostCounts[packet.end_ip] || 0) + 1;
    });

    return Object.entries(hostCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  },

  async getStatusDistribution(): Promise<{ name: string; value: number; color: string }[]> {
    const packets = await this.getPackets();
    const statusCounts: { [key: string]: number } = {
      critical: 0,
      medium: 0,
      normal: 0
    };

    packets.forEach(packet => {
      statusCounts[packet.status]++;
    });

    return [
      { name: 'Critical', value: statusCounts.critical, color: '#ff4d4f' },
      { name: 'Warning', value: statusCounts.medium, color: '#faad14' },
      { name: 'Info', value: statusCounts.normal, color: '#1890ff' }
    ];
  },

  async getNetworkLoad(): Promise<{ time: string; value1: number; value2: number }[]> {
    const packets = await this.getPackets();
    const hourlyData: { [key: string]: { tcp: number; udp: number } } = {};

    packets.forEach(packet => {
      const hour = new Date(packet.date).getHours();
      const key = `${hour.toString().padStart(2, '0')}:00`;
      
      if (!hourlyData[key]) {
        hourlyData[key] = { tcp: 0, udp: 0 };
      }

      if (packet.protocol === 'TCP') {
        hourlyData[key].tcp++;
      } else if (packet.protocol === 'UDP') {
        hourlyData[key].udp++;
      }
    });

    return Object.entries(hourlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, data]) => ({
        time,
        value1: data.tcp,
        value2: data.udp
      }));
  },

  async getAlerts(filters?: {
    severity?: string[];
    status?: string[];
    timeRange?: string;
    from?: Date;
    to?: Date;
  }): Promise<ThreatAlert[]> {
    const params = new URLSearchParams();
    
    if (filters) {
      if (filters.severity && filters.severity.length > 0) {
        filters.severity.forEach(s => params.append('severity', s));
      }
      if (filters.status && filters.status.length > 0) {
        filters.status.forEach(s => params.append('status', s));
      }
      if (filters.timeRange) {
        params.append('timeRange', filters.timeRange);
      }
      if (filters.from && filters.to) {
        params.append('from', filters.from.toISOString());
        params.append('to', filters.to.toISOString());
      }
    }
    
    const url = `${API_URL}/alerts${params.toString() ? '?' + params.toString() : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  async getAlertStats(filters?: {
    severity?: string[];
    status?: string[];
    timeRange?: string;
    from?: Date;
    to?: Date;
  }): Promise<AlertStats> {
    const alerts = await this.getAlerts(filters);
    const stats = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: alerts.length
    };

    alerts.forEach(alert => {
      if (alert.severity in stats) {
        (stats as any)[alert.severity]++;
      }
    });

    return stats;
  },

  async updateAlertStatus(alertId: string, status: ThreatAlert['status']): Promise<ThreatAlert> {
    const response = await api.patch(`${API_URL}/alerts/${alertId}`, { status });
    return response.data;
  },

  async getAlertsByTimeRange(from: Date, to: Date): Promise<ThreatAlert[]> {
    const response = await api.get(`${API_URL}/alerts/filter`, {
      params: { from, to }
    });
    return response.data;
  },

  async getRecentAlerts(limit: number = 10): Promise<ThreatAlert[]> {
    const response = await api.get(`${API_URL}/alerts/recent`, {
      params: { limit }
    });
    return response.data;
  }
}; 