import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ISupportTicket extends Document {
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

interface SupportTicketModel extends Model<ISupportTicket> {}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, priority: -1 });

export const SupportTicket = mongoose.model<ISupportTicket, SupportTicketModel>('SupportTicket', SupportTicketSchema);






