import mongoose from 'mongoose';

export interface IPacket {
  date: Date;
  start_ip: string;
  end_ip: string;
  protocol: string;
  frequency: number;
  status: 'critical' | 'medium' | 'normal';
  description: string;
  start_bytes: number;
  end_bytes: number;
}

const packetSchema = new mongoose.Schema<IPacket>({
  date: { type: Date, required: true, default: Date.now },
  start_ip: { type: String, required: true },
  end_ip: { type: String, required: true },
  protocol: { type: String, required: true },
  frequency: { type: Number, required: true },
  status: { 
    type: String, 
    required: true,
    enum: ['critical', 'medium', 'normal']
  },
  description: { type: String, required: true },
  start_bytes: { type: Number, required: true },
  end_bytes: { type: Number, required: true }
});

export const Packet = mongoose.model<IPacket>('Packet', packetSchema); 