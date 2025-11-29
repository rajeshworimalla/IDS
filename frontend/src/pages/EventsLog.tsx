import { FC, useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import '../styles/EventsLog.css';
import { authService } from '../services/auth';

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
  const [scanningState, setScanningState] = useState<'idle' | 'starting' | 'scanning' | 'stopping'>('idle');
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
        const token = authService.getToken();
        if (!token) {
          console.error('No authentication token found');
          return;
        }

        console.log('Fetching packets from backend...');
        const response = await fetch('http://localhost:5001/api/packets/all', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          // Limit initial load to last 300 packets for performance
          const limitedData = data.slice(0, 300);
          setPackets(limitedData);
        } else {
          const error = await response.text();
          console.error('Failed to fetch packets:', error);
          if (response.status === 401) {
            console.error('Authentication failed');
          }
        }
      } catch (error) {
        console.error('Error fetching packets:', error);
      }
    };

    fetchPackets();
  }, []);

  // Initialize socket connection and auto-start scanning
  useEffect(() => {
    const token = authService.getToken();
    if (!token) {
      console.error('No authentication token found');
      return;
    }

    const socket = io('http://localhost:5001', {
      auth: {
        token: token
      },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('Socket connected successfully');
      setSocket(socket);
      // Auto-start scanning when connected
      console.log('Auto-starting packet capture...');
      setScanningState('starting');
      socket.emit('start-scanning', { token });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setScanningState('idle');
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setScanningState('idle');
    });

    socket.on('scanning-status', (status) => {
      console.log('Scanning status:', status);
      setScanningState(status.isScanning ? 'scanning' : 'idle');
      if (status.error) {
        console.error('Scanning error:', status.error);
        setScanningState('idle');
      }
    });

    socket.on('new-packet', (packet) => {
      setPackets(prev => {
        // Check if packet already exists to avoid duplicates
        const exists = prev.some(p => p._id === packet._id);
        if (exists) {
          return prev;
        }
        // Limit displayed packets to last 300 for performance (still captures all to DB)
        const updated = [packet, ...prev];
        return updated.slice(0, 300);
      });
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const handleReset = async () => {
    try {
      const token = authService.getToken();
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      console.log('Sending reset request...');
      const response = await fetch('http://localhost:5001/api/packets/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
      const token = authService.getToken();
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const response = await fetch(`http://localhost:5001/api/packets/filter?from=${dateRange.from}&to=${dateRange.to}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      // Limit displayed results for performance
      const limitedData = data.slice(0, 500);
      setPackets(limitedData);
    } catch (error) {
      console.error('Error filtering packets:', error);
    }
  };

  const handleSearch = async () => {
    try {
      const token = authService.getToken();
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const response = await fetch(`http://localhost:5001/api/packets/search?q=${searchTerm}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      // Limit displayed results for performance
      const limitedData = data.slice(0, 500);
      setPackets(limitedData);
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
    if (scanningState !== 'idle') return;

    if (socket && socket.connected) {
      const token = authService.getToken();
      if (!token) {
        console.error('No authentication token found');
        return;
      }
      console.log('Emitting start-scanning event with token');
      setScanningState('starting');
      socket.emit('start-scanning', { token });
    } else {
      console.error('Socket not connected');
    }
  };

  const handleStopScanning = () => {
    if (scanningState !== 'scanning') return;

    if (socket && socket.connected) {
      const token = authService.getToken();
      if (!token) {
        console.error('No authentication token found');
        return;
      }
      console.log('Emitting stop-scanning event with token');
      setScanningState('stopping');
      socket.emit('stop-scanning', { token });
    } else {
      console.error('Socket not connected');
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
                <th>Packet Traff</th>
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
          <div className="records-info">
            Showing {packets.length} most recent packets (all packets are captured to database)
          </div>
          <div className="pagination-buttons">
            <motion.button
              className="pagination-btn"
              onClick={() => setShowResetConfirm(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Reset
            </motion.button>
            {scanningState === 'idle' ? (
              <motion.button
                className="pagination-btn primary"
                onClick={handleStartScanning}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Scanning
              </motion.button>
            ) : scanningState === 'starting' || scanningState === 'scanning' ? (
              <motion.button
                className="pagination-btn danger"
                onClick={handleStopScanning}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Stop Scanning
              </motion.button>
            ) : (
              <motion.button
                className="pagination-btn danger"
                disabled
                style={{ opacity: 0.6 }}
              >
                Stopping...
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