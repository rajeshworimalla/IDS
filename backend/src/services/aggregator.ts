import axios from 'axios';
import { config } from '../config/env';

export async function notifyEvent(type: string, payload: any) {
  try {
    const url = process.env.AGGREGATOR_URL || config.AGGREGATOR_URL;
    if (!url) return;
    await axios.post(url, { type, ts: Date.now(), payload }, {
      headers: config.AGGREGATOR_TOKEN ? { Authorization: `Bearer ${process.env.AGGREGATOR_TOKEN || config.AGGREGATOR_TOKEN}` } : undefined,
      timeout: 3000,
    }).catch(() => {});
  } catch (e) {
    // best-effort only
  }
}