import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: Date;
  loginAttempts?: number;
  lockUntil?: Date;
  isLocked: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
  incLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
}

export interface IUserModel extends Model<IUser> {
  // Add any static methods here if needed
}

const userSchema = new Schema<IUser, IUserModel>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
  },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Virtual to check if account is locked
userSchema.virtual('isLocked').get(function(this: any) {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to increment login attempts and potentially lock account
userSchema.methods.incLoginAttempts = async function(this: any): Promise<void> {
  const MAX_LOGIN_ATTEMPTS = 3;
  const LOCK_TIME = 30 * 1000; // 30 seconds

  // If lock expired, reset counters
  if (this.lockUntil && this.lockUntil.getTime() <= Date.now()) {
    await this.updateOne({ $unset: { loginAttempts: 1, lockUntil: 1 } });
    this.loginAttempts = 0;
    this.lockUntil = undefined;
  }

  const nextAttempts = (this.loginAttempts || 0) + 1;
  const updates: any = { $set: { loginAttempts: nextAttempts } };

  if (nextAttempts >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    updates.$set.lockUntil = new Date(Date.now() + LOCK_TIME);
  }

  await this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = async function(this: any): Promise<void> {
  await this.updateOne({ $unset: { loginAttempts: 1, lockUntil: 1 } });
  this.loginAttempts = 0;
  this.lockUntil = undefined;
};

// Create and export the model
const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export { User }; 