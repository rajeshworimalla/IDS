import { FC, useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import '../styles/EventsLog.css';

interface Packet {
  _id: string;
  date: string;
  start_ip: string;
  end_ip: string;
  protocol: string;
  frequency: number;
  status: 'critical' | 'medium' | 'normal';
  description: string;
  start_bytes: number;
  end_bytes: number;
}

const EventsLog: FC = () => {
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [packets, setPackets] = useState<Packet[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Filter options
  const filterOptions = [
    { id: 'all', label: 'Alle', active: true },
    { id: 'open', label: 'Geöffnet', active: false },
    { id: 'closed', label: 'Geschlossen', active: false },
  ];

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    // Load initial packets
    fetchPackets();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Listen for new packets
    socket.on('new-packet', (packet: Packet) => {
      setPackets(prev => [packet, ...prev].slice(0, 100));
    });

    return () => {
      socket.off('new-packet');
    };
  }, [socket]);

  const fetchPackets = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/packets');
      const data = await response.json();
      setPackets(data);
    } catch (error) {
      console.error('Error fetching packets:', error);
    }
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => 
      prev.includes(id)
        ? prev.filter(rowId => rowId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedRows.length === packets.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(packets.map(packet => packet._id));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'error';
      case 'medium': return 'warning';
      case 'normal': return 'success';
      default: return '';
    }
  };

  return (
    <div className="events-log-page">
      <Navbar />
      <motion.main
        className="events-log-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="events-header">
          <div className="filter-container">
            <div className="filter-group">
              {filterOptions.map(option => (
                <motion.button
                  key={option.id}
                  className={`filter-btn ${option.active ? 'active' : ''}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {option.label}
                </motion.button>
              ))}
            </div>
            
            <div className="date-filters">
              <div className="date-field">
                <label>Von</label>
                <input type="text" defaultValue="10.03.2024" />
              </div>
              <div className="date-field">
                <label>Bis</label>
                <input type="text" defaultValue="20.03.2024" />
              </div>
            </div>
            
            <div className="search-filter">
              <input
                type="text" 
                placeholder="0.0.0.0/0 Suche"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <motion.button 
            className="filter-action-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Filter
          </motion.button>
        </div>
        
        <div className="table-container">
          <motion.table 
            className="events-table"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <thead>
              <tr>
                <th>
                  <input 
                    type="checkbox" 
                    checked={selectedRows.length === packets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Status</th>
                <th>Datum</th>
                <th>Ende</th>
                <th>Start IP</th>
                <th>End IP</th>
                <th>Protokoll</th>
                <th>Beschreibung</th>
                <th>Frequenz</th>
                <th>Start Bytes</th>
                <th>End Bytes</th>
              </tr>
            </thead>
            <tbody>
              {packets.map((packet, index) => (
                <motion.tr
                  key={packet._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className={selectedRows.includes(packet._id) ? 'selected' : ''}
                >
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedRows.includes(packet._id)}
                      onChange={() => toggleRowSelection(packet._id)}
                    />
                  </td>
                  <td>
                    <span className={`status-indicator ${getStatusColor(packet.status)}`}></span>
                  </td>
                  <td>{new Date(packet.date).toLocaleDateString()}</td>
                  <td>{new Date(packet.date).toLocaleDateString()}</td>
                  <td>{packet.start_ip}</td>
                  <td>{packet.end_ip}</td>
                  <td>{packet.protocol}</td>
                  <td className="description-cell">{packet.description}</td>
                  <td>{packet.frequency}</td>
                  <td>{packet.start_bytes}</td>
                  <td>{packet.end_bytes}</td>
                </motion.tr>
              ))}
            </tbody>
          </motion.table>
        </div>
        
        <div className="pagination-controls">
          <div className="records-info">Anzeige 1-10 von {packets.length}</div>
          <div className="pagination-buttons">
            <button className="pagination-btn">Zurücksetzen</button>
            <button className="pagination-btn primary">Übernehmen</button>
          </div>
        </div>
      </motion.main>
    </div>
  );
};

export default EventsLog; 