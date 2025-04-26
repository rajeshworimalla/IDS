import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ISetting extends Document {
  userId: string;
  groupId: string;
  settingId: string;
  value: string | boolean;
  type: 'toggle' | 'dropdown' | 'input' | 'radio';
  name: string;
  description: string;
  options?: Array<{ value: string; label: string }>;
  createdAt: Date;
  updatedAt: Date;
}

interface SettingModel extends Model<ISetting> {
  recreateIndexes(): Promise<void>;
}

const SettingSchema = new Schema<ISetting>(
  {
    userId: {
      type: String,
      required: true
    },
    groupId: {
      type: String,
      required: true
    },
    settingId: {
      type: String,
      required: true
    },
    value: {
      type: Schema.Types.Mixed,
      required: true
    },
    type: {
      type: String,
      enum: ['toggle', 'dropdown', 'input', 'radio'],
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    options: {
      type: [{
        value: String,
        label: String
      }],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Remove all indexes and create only the compound index
SettingSchema.statics.recreateIndexes = async function() {
  try {
    // Drop all existing indexes except _id
    await this.collection.dropIndexes();
    
    // Create the compound unique index
    await this.collection.createIndex(
      { userId: 1, groupId: 1, settingId: 1 },
      { 
        unique: true,
        name: 'user_group_setting_unique'
      }
    );
    console.log('Indexes recreated successfully');
  } catch (error) {
    console.error('Error recreating indexes:', error);
    throw error;
  }
};

// Create the compound index on schema initialization
SettingSchema.index(
  { userId: 1, groupId: 1, settingId: 1 },
  { unique: true, name: 'user_group_setting_unique' }
);

export const Setting = mongoose.model<ISetting, SettingModel>('Setting', SettingSchema); 