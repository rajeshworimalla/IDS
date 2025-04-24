import axios from 'axios';

const API_URL = 'http://localhost:5001/api/packets';

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
  _id: string;
  count: number;
  avgBytes: number;
}

export const packetService = {
  async getPackets(): Promise<PacketData[]> {
    const response = await axios.get(`${API_URL}/all`);
    return response.data;
  },

  async getPacketStats(): Promise<PacketStats[]> {
    const response = await axios.get(`${API_URL}/stats`);
    return response.data;
  },

  async getPacketsByTimeRange(from: Date, to: Date): Promise<PacketData[]> {
    const response = await axios.get(`${API_URL}/filter`, {
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
  }
}; 