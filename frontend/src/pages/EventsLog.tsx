import { FC, useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
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
  console.log('[EventsLog] Component rendering...');
  
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [packets, setPackets] = useState<Packet[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [scanningState, setScanningState] = useState<'idle' | 'starting' | 'scanning' | 'stopping'>('idle');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs for throttling packet updates (must be at top level, not inside useEffect)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPacketsRef = useRef<Packet[]>([]);

  // Check authentication immediately
  useEffect(() => {
    const token = authService.getToken();
    if (!token) {
      console.error('[EventsLog] No token found, redirecting...');
      window.location.href = '/login';
      return;
    }
    console.log('[EventsLog] Token found, proceeding...');
  }, []);

  // Fetch packets on component mount
  useEffect(() => {
    let mounted = true;
    const fetchPackets = async () => {
      try {
        console.log('[EventsLog] Starting to fetch packets...');
        setIsLoading(true);
        setError(null);
        const token = authService.getToken();
        if (!token) {
          console.error('[EventsLog] No token in fetchPackets');
          setError('Not authenticated. Please login.');
          setIsLoading(false);
          return;
        }

        console.log('[EventsLog] Fetching from API...');
        const response = await fetch('http://localhost:5001/api/packets/all', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!mounted) {
          console.log('[EventsLog] Component unmounted, aborting');
          return;
        }

        console.log('[EventsLog] Response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log('[EventsLog] Received data:', Array.isArray(data) ? data.length : 'not array');
          const limitedData = Array.isArray(data) ? data.slice(0, 50) : [];
          setPackets(limitedData);
          console.log('[EventsLog] Set packets:', limitedData.length);
        } else {
          const errorText = await response.text();
          console.error('[EventsLog] API error:', response.status, errorText);
          setError(`Failed to load packets: ${response.status}`);
        }
      } catch (error: any) {
        if (!mounted) return;
        console.error('[EventsLog] Fetch error:', error);
        setError(`Network error: ${error.message || 'Failed to connect to backend'}`);
      } finally {
        if (mounted) {
          console.log('[EventsLog] Setting loading to false');
          setIsLoading(false);
        }
      }
    };

    fetchPackets();
    return () => { 
      console.log('[EventsLog] Cleanup: unmounting');
      mounted = false; 
    };
  }, []);

  // Initialize socket connection
  useEffect(() => {
    let mounted = true;
    const token = authService.getToken();
    if (!token) return;

    const socket = io('http://localhost:5001', {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    socket.on('connect', () => {
      if (!mounted) return;
      setSocket(socket);
      setScanningState('starting');
      socket.emit('start-scanning', { token });
    });

    socket.on('connect_error', () => {
      if (!mounted) return;
      setScanningState('idle');
    });

    socket.on('disconnect', () => {
      if (!mounted) return;
      setScanningState('idle');
    });

    socket.on('scanning-status', (status: any) => {
      if (!mounted) return;
      setScanningState(status.isScanning ? 'scanning' : 'idle');
      if (status.error) {
        setScanningState('idle');
      }
    });

    // Throttle packet updates (using refs defined at component top level)
    socket.on('new-packet', (packet: any) => {
      if (!mounted) return;
      setPackets((prev: Packet[]) => {
        const exists = prev.some((p: Packet) => p._id === packet._id);
        if (exists) return prev;
        
        pendingPacketsRef.current.push(packet);
        
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
        
        updateTimeoutRef.current = setTimeout(() => {
          if (!mounted) return;
          setPackets((prev: Packet[]) => {
            const newPackets = [...pendingPacketsRef.current, ...prev];
            pendingPacketsRef.current = [];
            return newPackets.slice(0, 50);
          });
        }, 1000);
        
        return prev;
      });
    });

    return () => {
      mounted = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, []);

  const handleReset = async () => {
    try {
      const token = authService.getToken();
      if (!token) return;

      const response = await fetch('http://localhost:5001/api/packets/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setPackets([]);
        setShowResetConfirm(false);
      }
    } catch (error) {
      console.error('Error resetting packets:', error);
    }
  };

  const handleSearch = async () => {
    try {
      const token = authService.getToken();
      if (!token) return;

      const response = await fetch(`http://localhost:5001/api/packets/search?q=${searchTerm}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setPackets(data);
    } catch (error) {
      console.error('Error searching packets:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows((prev: string[]) => 
      prev.includes(id)
        ? prev.filter((rowId: string) => rowId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedRows.length === packets.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(packets.map((packet: Packet) => packet._id));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return '#ff4d4f';
      case 'medium': return '#faad14';
      case 'normal': return '#52c41a';
      default: return '#999';
    }
  };

  const handleStartScanning = () => {
    if (scanningState !== 'idle' || !socket?.connected) return;
    const token = authService.getToken();
    if (!token) return;
    setScanningState('starting');
    socket.emit('start-scanning', { token });
  };

  const handleStopScanning = () => {
    if (scanningState !== 'scanning' || !socket?.connected) return;
    const token = authService.getToken();
    if (!token) return;
    setScanningState('stopping');
    socket.emit('stop-scanning', { token });
  };

  // Always render something visible - wrap in try-catch for safety
  try {
    console.log('[EventsLog] Rendering JSX, state:', { isLoading, error, packetsCount: packets.length });
    
    return (
      <div className="events-log-page" style={{ minHeight: '100vh', display: 'flex' }}>
        <Navbar />
        <main className="events-log-content" style={{ flex: 1, padding: '2rem', marginLeft: '240px' }}>
          <div className="events-header">
            <h1 style={{ color: '#fff', marginBottom: '1rem' }}>Traffic Collector</h1>
            <div style={{ 
              background: '#3699ff', 
              color: '#fff', 
              padding: '0.5rem 1rem', 
              borderRadius: '4px',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              display: 'inline-block'
            }}>
              Status: {isLoading ? 'Loading...' : error ? `Error: ${error}` : `Loaded ${packets.length} packets`}
            </div>
          </div>
        
        {isLoading && (
          <div className="loading-container">
            <p>Loading packets...</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
            <button onClick={() => window.location.reload()} className="btn-primary" style={{ marginLeft: '1rem' }}>
              Reload Page
            </button>
          </div>
        )}
        
        {!isLoading && !error && (
          <>
            <div className="events-controls">
              <input
                type="text"
                id="search-input"
                placeholder="Search packets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                className="search-input"
              />
              <button onClick={handleSearch} className="btn-primary">Search</button>
              <button onClick={() => setShowResetConfirm(true)} className="btn-danger">Reset</button>
              {scanningState === 'idle' ? (
                <button onClick={handleStartScanning} className="btn-success">Start Scanning</button>
              ) : scanningState === 'starting' ? (
                <button disabled className="btn-disabled">Starting...</button>
              ) : scanningState === 'scanning' ? (
                <button onClick={handleStopScanning} className="btn-danger">Stop Scanning</button>
              ) : (
                <button disabled className="btn-disabled">Stopping...</button>
              )}
            </div>

            <div className="events-table-container">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>
                      <input 
                        type="checkbox" 
                        checked={selectedRows.length === packets.length && packets.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Source IP</th>
                    <th>Dest IP</th>
                    <th>Protocol</th>
                    <th>Description</th>
                    <th>Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {packets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    {scanningState === 'scanning' ? (
                      <div>
                        <p>📡 Scanning for packets...</p>
                        <p>Waiting for network traffic. Try browsing the site or running an attack from Kali Linux.</p>
                      </div>
                    ) : scanningState === 'starting' ? (
                      <p>🚀 Starting packet capture...</p>
                    ) : (
                      <div>
                        <p>No packets captured yet</p>
                        <p>Click "Start Scanning" to begin capturing network traffic.</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                packets.map((packet: Packet) => {
                  const statusBg = getStatusColor(packet.status);
                  return (
                    <tr
                      key={packet._id}
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
                        <span className="status-badge" style={{ backgroundColor: statusBg }}>
                          {packet.status}
                        </span>
                      </td>
                      <td>{new Date(packet.date).toLocaleString()}</td>
                      <td className="ip-cell">{packet.start_ip}</td>
                      <td className="ip-cell">{packet.end_ip}</td>
                      <td>{packet.protocol}</td>
                      <td className="description-cell">{packet.description}</td>
                      <td>{packet.frequency}</td>
                    </tr>
                  );
                })
              )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {showResetConfirm && (
          <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
            <div className="modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <h3>Confirm Reset</h3>
              <p>Are you sure you want to clear all packets? This action cannot be undone.</p>
              <div className="modal-actions">
                <button onClick={() => setShowResetConfirm(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleReset} className="btn-danger">Confirm Reset</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    );
  } catch (err: any) {
    console.error('[EventsLog] Render error:', err);
    return (
      <div className="events-log-page" style={{ minHeight: '100vh', display: 'flex' }}>
        <Navbar />
        <main className="events-log-content" style={{ flex: 1, padding: '2rem', marginLeft: '240px' }}>
          <h1 style={{ color: '#fff' }}>Traffic Collector</h1>
          <div style={{ 
            background: '#ff4d4f', 
            color: '#fff', 
            padding: '1rem', 
            borderRadius: '8px',
            marginTop: '1rem'
          }}>
            <strong>Render Error:</strong> {err.message || 'Unknown error'}
            <button 
              onClick={() => window.location.reload()} 
              style={{
                marginLeft: '1rem',
                padding: '0.5rem 1rem',
                background: '#3699ff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </main>
      </div>
    );
  }
};

export default EventsLog;
