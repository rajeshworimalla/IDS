import api from './api';

const API_URL = '/api/settings';

export interface Setting {
  id: string;
  name: string;
  description: string;
  type: 'toggle' | 'dropdown' | 'input' | 'radio';
  value: any;
  options?: { value: string; label: string }[];
}

export interface SettingGroup {
  id: string;
  title: string;
  settings: Setting[];
}

class SettingsService {
  private async retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      console.log(`Retrying... ${retries} attempts left`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.retry(fn, retries - 1);
    }
  }

  async getSettings(): Promise<SettingGroup[]> {
    return this.retry(async () => {
      try {
        const response = await api.get(API_URL);
        return response.data;
      } catch (error) {
        console.error('Error fetching settings:', error);
        throw error;
      }
    });
  }

  async updateSettings(settings: SettingGroup[]): Promise<void> {
    return this.retry(async () => {
      try {
        await api.put(API_URL, { settings });
      } catch (error) {
        console.error('Error updating settings:', error);
        throw error;
      }
    });
  }

  async resetSettings(): Promise<void> {
    return this.retry(async () => {
      try {
        await api.post(`${API_URL}/reset`, {});
      } catch (error) {
        console.error('Error resetting settings:', error);
        throw error;
      }
    });
  }
}

export const settingsService = new SettingsService(); 