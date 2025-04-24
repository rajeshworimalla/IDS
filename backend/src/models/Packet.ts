import mongoose, { Document, Schema } from 'mongoose';

export interface IPacket extends Document {
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

const PacketSchema = new Schema({
  date: { type: Date, required: true },
  start_ip: { type: String, required: true },
  end_ip: { type: String, required: true },
  protocol: { type: String, required: true },
  frequency: { type: Number, required: true },
  status: { type: String, enum: ['critical', 'medium', 'normal'], required: true },
  description: { type: String, required: true },
  start_bytes: { type: Number, required: true },
  end_bytes: { type: Number, required: true },
  is_malicious: { type: Boolean, default: false },
  attack_type: { type: String, default: 'normal' },
  confidence: { type: Number, default: 0 }
});

export const Packet = mongoose.model<IPacket>('Packet', PacketSchema); 