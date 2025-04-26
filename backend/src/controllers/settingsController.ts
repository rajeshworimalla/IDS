import { Request, Response } from 'express';
import { Setting, ISetting } from '../models/Setting';
import mongoose from 'mongoose';

interface SettingOption {
  value: string;
  label: string;
}

interface BaseSetting {
  id: string;
  name: string;
  description: string;
  type: 'toggle' | 'dropdown' | 'input' | 'radio';
  value: any;
}

interface ToggleSetting extends BaseSetting {
  type: 'toggle';
  value: boolean;
}

interface DropdownSetting extends BaseSetting {
  type: 'dropdown';
  value: string;
  options: SettingOption[];
}

interface InputSetting extends BaseSetting {
  type: 'input';
  value: string;
}

interface RadioSetting extends BaseSetting {
  type: 'radio';
  value: string;
  options: SettingOption[];
}

type SettingType = ToggleSetting | DropdownSetting | InputSetting | RadioSetting;

interface SettingGroup {
  id: string;
  title: string;
  settings: SettingType[];
}

// Default settings configuration
const defaultSettings: SettingGroup[] = [
  {
    id: 'general',
    title: 'General Settings',
    settings: [
      {
        id: 'darkMode',
        name: 'Dark Mode',
        description: 'Enable dark mode for the application.',
        type: 'toggle',
        value: true
      } as ToggleSetting,
      {
        id: 'notifications',
        name: 'Notifications',
        description: 'Enable notifications for important events.',
        type: 'toggle',
        value: true
      } as ToggleSetting,
      {
        id: 'language',
        name: 'Language',
        description: 'Select your preferred language.',
        type: 'dropdown',
        value: 'en',
        options: [
          { value: 'en', label: 'English' },
          { value: 'de', label: 'German' },
          { value: 'fr', label: 'French' }
        ]
      } as DropdownSetting
    ]
  },
  {
    id: 'alerts',
    title: 'Alert Settings',
    settings: [
      {
        id: 'emailAlerts',
        name: 'Email Alerts',
        description: 'Receive alert notifications via email.',
        type: 'toggle',
        value: true
      } as ToggleSetting,
      {
        id: 'alertThreshold',
        name: 'Alert Threshold',
        description: 'Minimum severity level for notifications.',
        type: 'dropdown',
        value: 'medium',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'critical', label: 'Critical' }
        ]
      } as DropdownSetting,
      {
        id: 'alertFrequency',
        name: 'Alert Frequency',
        description: 'How often to send batched alerts.',
        type: 'dropdown',
        value: 'immediate',
        options: [
          { value: 'immediate', label: 'Immediate' },
          { value: 'hourly', label: 'Hourly' },
          { value: 'daily', label: 'Daily' }
        ]
      } as DropdownSetting
    ]
  },
  {
    id: 'system',
    title: 'System Settings',
    settings: [
      {
        id: 'dataRetention',
        name: 'Data Retention Period',
        description: 'How long to store historical data.',
        type: 'dropdown',
        value: '90days',
        options: [
          { value: '30days', label: '30 Days' },
          { value: '90days', label: '90 Days' },
          { value: '180days', label: '180 Days' },
          { value: '1year', label: '1 Year' }
        ]
      } as DropdownSetting,
      {
        id: 'autoUpdate',
        name: 'Automatic Updates',
        description: 'Allow the system to update automatically.',
        type: 'toggle',
        value: true
      } as ToggleSetting,
      {
        id: 'logLevel',
        name: 'Logging Level',
        description: 'Level of detail for system logs.',
        type: 'dropdown',
        value: 'info',
        options: [
          { value: 'error', label: 'Error' },
          { value: 'warn', label: 'Warning' },
          { value: 'info', label: 'Info' },
          { value: 'debug', label: 'Debug' }
        ]
      } as DropdownSetting
    ]
  },
  {
    id: 'account',
    title: 'Account Settings',
    settings: [
      {
        id: 'userName',
        name: 'Username',
        description: 'Your login username.',
        type: 'input',
        value: 'admin'
      } as InputSetting,
      {
        id: 'email',
        name: 'Email Address',
        description: 'Your account email address.',
        type: 'input',
        value: 'admin@example.com'
      } as InputSetting,
      {
        id: 'twoFactor',
        name: 'Two-factor Authentication',
        description: 'Enable additional security for your account.',
        type: 'toggle',
        value: false
      } as ToggleSetting
    ]
  }
];

export const getSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user has any settings
    let settings = await Setting.find({ userId });

    // If no settings exist, initialize with defaults
    if (settings.length === 0) {
      const defaultSettingsDocs = defaultSettings.flatMap(group =>
        group.settings.map(setting => ({
          userId,
          groupId: group.id,
          settingId: setting.id,
          value: setting.value,
          type: setting.type,
          name: setting.name,
          description: setting.description,
          options: 'options' in setting ? setting.options : undefined
        }))
      );

      await Setting.insertMany(defaultSettingsDocs);
      settings = await Setting.find({ userId });
    }

    // Transform settings into grouped format
    const groupedSettings = defaultSettings.map(group => ({
      id: group.id,
      title: group.title,
      settings: group.settings.map(defaultSetting => {
        const userSetting = settings.find(
          s => s.groupId === group.id && s.settingId === defaultSetting.id
        );
        return {
          id: defaultSetting.id,
          name: defaultSetting.name,
          description: defaultSetting.description,
          type: defaultSetting.type,
          value: userSetting ? userSetting.value : defaultSetting.value,
          ...(('options' in defaultSetting) && { options: defaultSetting.options })
        };
      })
    }));

    res.json(groupedSettings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Error fetching settings' });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ message: 'Settings must be an array of groups' });
    }

    // Flatten the settings groups into individual settings
    const flattenedSettings = settings.flatMap((group: SettingGroup) => 
      group.settings.map((setting: SettingType) => ({
        userId,
        groupId: group.id,
        settingId: setting.id,
        value: setting.value,
        type: setting.type,
        name: setting.name,
        description: setting.description,
        options: 'options' in setting ? setting.options : undefined
      }))
    );

    // Delete existing settings for this user
    await Setting.deleteMany({ userId });

    // Insert the new settings
    await Setting.insertMany(flattenedSettings);

    // Get the updated settings in grouped format
    const groupedSettings = defaultSettings.map(group => ({
      id: group.id,
      title: group.title,
      settings: group.settings.map((defaultSetting: SettingType) => {
        const userSetting = flattenedSettings.find(
          s => s.groupId === group.id && s.settingId === defaultSetting.id
        );
        return {
          id: defaultSetting.id,
          name: defaultSetting.name,
          description: defaultSetting.description,
          type: defaultSetting.type,
          value: userSetting ? userSetting.value : defaultSetting.value,
          ...(('options' in defaultSetting) && { options: defaultSetting.options })
        };
      })
    }));

    res.json(groupedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Error updating settings' });
  }
};

export const recreateIndexes = async (req: Request, res: Response) => {
  try {
    await Setting.recreateIndexes();
    res.json({ message: 'Indexes recreated successfully' });
  } catch (error) {
    console.error('Error recreating indexes:', error);
    res.status(500).json({ message: 'Error recreating indexes' });
  }
};

export const resetSettings = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const userId = req.user.id;

    // Delete all settings for the user
    await Setting.deleteMany({ userId });

    // Create default settings
    const defaultSettingsDocs = defaultSettings.flatMap(group =>
      group.settings.map(setting => ({
        userId,
        groupId: group.id,
        settingId: setting.id,
        value: setting.value,
        type: setting.type,
        name: setting.name,
        description: setting.description,
        options: 'options' in setting ? setting.options : undefined
      }))
    );

    await Setting.insertMany(defaultSettingsDocs);
    res.json({ message: 'Settings reset successfully' });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ message: 'Server error resetting settings' });
  }
}; 