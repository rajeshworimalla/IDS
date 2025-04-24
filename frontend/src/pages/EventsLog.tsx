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
  const [isScanning, setIsScanning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: '10.03.2024',
    to: '20.03.2024'
  });
  
  // Filter options
  const filterOptions = [
    { id: 'all', label: 'All', active: true },
    { id: 'open', label: 'Open', active: false },
    { id: 'closed', label: 'Closed', active: false },
  ];

  // Fetch packets on component mount
  useEffect(() => {
    const fetchPackets = async () => {
      try {
        console.log('Fetching packets from backend...');
        const response = await fetch('http://localhost:5001/api/packets/all');
        if (response.ok) {
          const data = await response.json();
          console.log(`Received ${data.length} packets from backend`);
          setPackets(data);
        } else {
          console.error('Failed to fetch packets:', await response.text());
        }
      } catch (error) {
        console.error('Error fetching packets:', error);
      }
    };

    fetchPackets();
  }, []);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:5001', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    newSocket.on('connect', () => {
      console.log('Socket connected successfully');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // The disconnection was initiated by the server, you need to reconnect manually
        newSocket.connect();
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
    });

    setSocket(newSocket);

    // Listen for new packets
    newSocket.on('new-packet', (packet: Packet) => {
      console.log('Received new packet:', packet);
      setPackets(prev => [packet, ...prev]);
    });

    // Listen for scanning status updates
    newSocket.on('scanning-status', (status: { isScanning: boolean; error?: string }) => {
      console.log('Scanning status update:', status);
      setIsScanning(status.isScanning);
      if (status.error) {
        console.error('Scanning error:', status.error);
      }
    });

    return () => {
      if (newSocket) {
        newSocket.removeAllListeners();
        newSocket.disconnect();
      }
    };
  }, []);

  const handleReset = async () => {
    try {
      console.log('Sending reset request...');
      const response = await fetch('http://localhost:5001/api/packets/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Reset successful:', result);
        setPackets([]);
        setShowResetConfirm(false);
      } else {
        const error = await response.text();
        console.error('Failed to reset packets:', error);
      }
    } catch (error) {
      console.error('Error resetting packets:', error);
    }
  };

  const handleDateFilter = async () => {
    try {
      const response = await fetch(`http://localhost:5001/api/packets/filter?from=${dateRange.from}&to=${dateRange.to}`);
      const data = await response.json();
      setPackets(data);
    } catch (error) {
      console.error('Error filtering packets:', error);
    }
  };

  const handleSearch = async () => {
    try {
      const response = await fetch(`http://localhost:5001/api/packets/search?q=${searchTerm}`);
      const data = await response.json();
      setPackets(data);
    } catch (error) {
      console.error('Error searching packets:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.currentTarget.id === 'search-input') {
        handleSearch();
      }
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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'critical': return 'Critical Threat';
      case 'medium': return 'Medium Threat';
      case 'normal': return 'Normal Traffic';
      default: return 'Unknown';
    }
  };

  const handleStartScanning = () => {
    if (socket) {
      console.log('Emitting start-scanning event');
      socket.emit('start-scanning');
    }
  };

  const handleStopScanning = () => {
    if (socket) {
      console.log('Emitting stop-scanning event');
      socket.emit('stop-scanning');
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
                <label>From</label>
                <input 
                  type="text" 
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && handleDateFilter()}
                />
              </div>
              <div className="date-field">
                <label>To</label>
                <input 
                  type="text" 
                  value={dateRange.to}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && handleDateFilter()}
                />
              </div>
            </div>
            
            <div className="search-filter">
              <input
                type="text" 
                id="search-input"
                placeholder="0.0.0.0/0 Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
              />
            </div>
          </div>
          
          <motion.button 
            className="filter-action-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDateFilter}
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
                <th>Date</th>
                <th>End</th>
                <th>Start IP</th>
                <th>End IP</th>
                <th>Protocol</th>
                <th>Description</th>
                <th>Frequency</th>
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
                    <div className="status-container" title={getStatusText(packet.status)}>
                      <span className={`status-indicator ${getStatusColor(packet.status)}`}></span>
                      <span className="status-text">{packet.status}</span>
                    </div>
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
          <div className="records-info">Showing 1-10 of {packets.length}</div>
          <div className="pagination-buttons">
            <motion.button
              className="pagination-btn"
              onClick={() => setShowResetConfirm(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Reset
            </motion.button>
            {!isScanning ? (
              <motion.button
                className="pagination-btn primary"
                onClick={handleStartScanning}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Scanning
              </motion.button>
            ) : (
              <motion.button
                className="pagination-btn danger"
                onClick={handleStopScanning}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Stop Scanning
              </motion.button>
            )}
          </div>
        </div>

        {/* Reset Confirmation Dialog */}
        {showResetConfirm && (
          <motion.div 
            className="confirmation-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="dialog-content">
              <h3>Confirm Reset</h3>
              <p>Are you sure you want to clear all packets? This action cannot be undone.</p>
              <div className="dialog-buttons">
                <motion.button
                  className="dialog-btn cancel"
                  onClick={() => setShowResetConfirm(false)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  className="dialog-btn confirm"
                  onClick={handleReset}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Confirm Reset
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.main>
    </div>
  );
};

export default EventsLog; 