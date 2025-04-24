import { Request, Response } from 'express';
import { Packet } from '../models/Packet';

export const getPackets = async (req: Request, res: Response) => {
  try {
    const { 
      protocol, 
      startDate, 
      endDate, 
      startIp, 
      endIp, 
      status 
    } = req.query;

    const query: any = {};

    if (protocol) query.protocol = protocol;
    if (status) query.status = status;
    if (startIp) query.start_ip = startIp;
    if (endIp) query.end_ip = endIp;
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const packets = await Packet.find(query)
      .sort({ date: -1 })
      .limit(100);

    res.json(packets);
  } catch (error) {
    console.error('Error fetching packets:', error);
    res.status(500).json({ message: 'Error fetching packets' });
  }
};

export const getPacketStats = async (req: Request, res: Response) => {
  try {
    const stats = await Packet.aggregate([
      {
        $group: {
          _id: '$protocol',
          count: { $sum: 1 },
          avgBytes: { $avg: { $add: ['$start_bytes', '$end_bytes'] } }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching packet stats:', error);
    res.status(500).json({ message: 'Error fetching packet stats' });
  }
}; 