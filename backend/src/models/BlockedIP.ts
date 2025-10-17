import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBlockedIP extends Document {
  user: mongoose.Types.ObjectId;
  ip: string;
  reason?: string;
  blockedAt: Date;
}

const BlockedIPSchema = new Schema<IBlockedIP>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ip: { type: String, required: true },
  reason: { type: String },
  blockedAt: { type: Date, default: Date.now },
});

// Uniqueness per user+ip
BlockedIPSchema.index({ user: 1, ip: 1 }, { unique: true });

export const BlockedIP: Model<IBlockedIP> = mongoose.model<IBlockedIP>('BlockedIP', BlockedIPSchema);