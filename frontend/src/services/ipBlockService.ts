import api from './api';

const API_URL = '/api/ips';

export interface BlockedIP {
  ip: string;
  reason?: string;
  blockedAt: string;
  method?: string;
}

export interface BlockResponse extends BlockedIP {
  applied?: boolean;
  method?: string;
  error?: string;
}

export interface BlockPolicy {
  windowSeconds: number; // e.g., 60
  threshold: number; // requests/events per window
  banMinutes: number; // duration of ban
  useFirewall?: boolean; // iptables/ipset
  useNginxDeny?: boolean; // nginx deny list
}

export const ipBlockService = {
  async getBlockedIPs(): Promise<BlockedIP[]> {
    const res = await api.get(`${API_URL}/blocked`);
    return res.data;
  },

  async blockIP(ip: string, reason?: string): Promise<BlockResponse> {
    const res = await api.post(`${API_URL}/block`, { ip, reason });
    return res.data;
  },

  async unblockIP(ip: string): Promise<void> {
    await api.delete(`${API_URL}/block/${encodeURIComponent(ip)}`);
  },

  async getPolicy(): Promise<BlockPolicy> {
    const res = await api.get(`${API_URL}/policy`);
    return res.data;
  },

  async updatePolicy(policy: BlockPolicy): Promise<void> {
    await api.put(`${API_URL}/policy`, policy);
  },
};
