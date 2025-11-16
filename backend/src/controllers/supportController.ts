import { Request, Response } from 'express';
import { SupportTicket } from '../models/SupportTicket';

// Get all tickets for the authenticated user
export const getTickets = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const tickets = await SupportTicket.find({ userId })
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json(tickets);
  } catch (error: any) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create a new support ticket
export const createTicket = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, email, subject, message, priority } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, email, subject, and message are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    const ticketPriority = priority && validPriorities.includes(priority) 
      ? priority 
      : 'medium';

    // Create ticket
    const ticket = new SupportTicket({
      userId,
      name,
      email,
      subject,
      message,
      priority: ticketPriority,
      status: 'open'
    });

    await ticket.save();

    res.status(201).json({
      message: 'Support ticket created successfully',
      ticket: ticket.toObject()
    });
  } catch (error: any) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get FAQ data
export const getFAQ = async (req: Request, res: Response) => {
  try {
    // Return static FAQ data (can be moved to database later)
    const faqs = [
      {
        question: 'How do I configure alert notifications?',
        answer: 'Go to Settings > Alerts and configure your preferred notification methods. You can choose between email, SMS, or in-app notifications, and set thresholds for different severity levels.'
      },
      {
        question: 'Can I export security reports?',
        answer: 'Yes, you can export reports in various formats (PDF, CSV, JSON) from the Dashboard or Monitoring page. Click on the Export button in the top-right corner and select your preferred format.'
      },
      {
        question: 'How do I add new users to the system?',
        answer: 'Navigate to Settings > Account > User Management and click "Add User". Fill in the required information and assign appropriate roles and permissions.'
      },
      {
        question: 'What does the severity level of alerts mean?',
        answer: 'The severity levels (Critical, High, Medium, Low) indicate the potential impact and urgency of the threat. Critical alerts require immediate attention, while Low severity alerts are informational.'
      },
      {
        question: 'How often is the threat database updated?',
        answer: 'Our threat intelligence database is updated in real-time with feeds from multiple sources. The system automatically pulls updates every 15 minutes for emerging threats.'
      },
      {
        question: 'How do I block an IP address?',
        answer: 'Go to the Blocker page and click on "Blocked IPs" tab. Enter the IP address or domain name and optionally provide a reason. Click "Block" to add it to the blocklist.'
      },
      {
        question: 'What is the difference between firewall blocking and nginx deny?',
        answer: 'Firewall blocking uses iptables/ipset to block traffic at the network level, while nginx deny blocks at the web server level. Both methods can be enabled simultaneously for layered protection.'
      },
      {
        question: 'How do I view real-time packet monitoring?',
        answer: 'Navigate to the Monitoring page to see real-time packet analysis. The system displays packets with ML predictions, attack types, and confidence scores as they are captured.'
      }
    ];

    res.json(faqs);
  } catch (error: any) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};






