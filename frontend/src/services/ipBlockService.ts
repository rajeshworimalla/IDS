import api from './api';

const API_URL = '/api/ips';

export interface BlockedIP {
  ip: string;
  reason?: string;
  blockedAt: string;
}

export interface BlockResponse extends BlockedIP {
  applied?: boolean;
  method?: string;
  error?: string;
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
};
