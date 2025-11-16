import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface SupportTicket {
  _id?: string;
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketData {
  name: string;
  email: string;
  subject: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface FAQ {
  question: string;
  answer: string;
}

export const supportService = {
  async getTickets(): Promise<SupportTicket[]> {
    const response = await api.get(API_ENDPOINTS.SUPPORT.TICKETS);
    return response.data;
  },

  async createTicket(data: CreateTicketData): Promise<{ message: string; ticket: SupportTicket }> {
    const response = await api.post(API_ENDPOINTS.SUPPORT.CREATE_TICKET, data);
    return response.data;
  },

  async getFAQ(): Promise<FAQ[]> {
    const response = await api.get(API_ENDPOINTS.SUPPORT.FAQ);
    return response.data;
  }
};






