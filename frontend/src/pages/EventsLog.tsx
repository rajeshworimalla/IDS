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

  // Fetch packets on component mount
  useEffect(() => {
    console.log('[EventsLog] useEffect - fetching packets');
    const fetchPackets = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const token = authService.getToken();
        console.log('[EventsLog] Token exists:', !!token);
        if (!token) {
          console.error('No authentication token found');
          setError('Not authenticated. Please login.');
          setIsLoading(false);
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

        console.log('[EventsLog] Response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log(`Received ${data.length} packets from backend`);
          const limitedData = Array.isArray(data) ? data.slice(0, 50) : [];
          setPackets(limitedData);
        } else {
          const errorText = await response.text();
          console.error('Failed to fetch packets:', errorText);
          setError(`Failed to load packets: ${response.status}`);
        }
      } catch (error: any) {
        console.error('Error fetching packets:', error);
        setError(`Network error: ${error.message || 'Failed to connect to backend'}`);
      } finally {
        setIsLoading(false);
        console.log('[EventsLog] Loading complete');
      }
    };

    fetchPackets();
  }, []);

  // Initialize socket connection
  useEffect(() => {
    console.log('[EventsLog] useEffect - initializing socket');
    const token = authService.getToken();
    if (!token) {
      console.error('No authentication token found for socket');
      return;
    }

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
      console.log('Socket connected successfully');
      setSocket(socket);
      // Auto-start packet capture when socket connects
      const token = authService.getToken();
      if (token) {
        console.log('Auto-starting packet capture...');
        setScanningState('starting');
        socket.emit('start-scanning', { token });
      }
    });

    socket.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error);
      setScanningState('idle');
    });

    socket.on('disconnect', (reason: any) => {
      console.log('Socket disconnected:', reason);
      setScanningState('idle');
    });

    socket.on('scanning-status', (status: any) => {
      console.log('Scanning status:', status);
      setScanningState(status.isScanning ? 'scanning' : 'idle');
      if (status.error) {
        console.error('Scanning error:', status.error);
        setScanningState('idle');
      }
    });

    // Throttle packet updates to prevent lag
    const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingPacketsRef = useRef<Packet[]>([]);
    
    socket.on('new-packet', (packet: any) => {
      setPackets((prev: Packet[]) => {
        const exists = prev.some((p: Packet) => p._id === packet._id);
        if (exists) return prev;
        
        pendingPacketsRef.current.push(packet);
        
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
        
        updateTimeoutRef.current = setTimeout(() => {
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
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
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
      setPackets(data);
    } catch (error) {
      console.error('Error searching packets:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (e.currentTarget.id === 'search-input') {
        handleSearch();
      }
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
      case 'critical': return 'error';
      case 'medium': return 'warning';
      case 'normal': return 'success';
      default: return '';
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

  console.log('[EventsLog] Rendering with state:', { isLoading, error, packetsCount: packets.length });

  // Show error state
  if (error && !isLoading) {
    return (
      <div className="events-log-page" style={{ background: '#0e1116', minHeight: '100vh', display: 'flex', position: 'relative', zIndex: 1 }}>
        <Navbar />
        <main className="events-log-content" style={{ background: '#0e1116', color: '#e6edf3', padding: '2rem', marginLeft: '240px', flex: 1, position: 'relative', zIndex: 1 }}>
          <h1 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '2rem' }}>Traffic Collector</h1>
          <div style={{ 
            background: '#ff4d4f', 
            color: '#fff', 
            padding: '1rem', 
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <strong>Error:</strong> {error}
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '6px',
              border: 'none',
              background: '#3699ff',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="events-log-page" style={{ background: '#0e1116', minHeight: '100vh', display: 'flex', position: 'relative', zIndex: 1 }}>
      <Navbar />
      <main className="events-log-content" style={{ background: '#0e1116', color: '#e6edf3', padding: '2rem', marginLeft: '240px', flex: 1, position: 'relative', zIndex: 1 }}>
        <h1 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '2rem', fontWeight: 'bold' }}>Traffic Collector</h1>
        
        {/* DEBUG: Always visible test box */}
        <div style={{
          background: '#ff0000',
          color: '#fff',
          padding: '1rem',
          marginBottom: '1rem',
          borderRadius: '8px',
          border: '3px solid #fff',
          fontSize: '1.2rem',
          fontWeight: 'bold'
        }}>
          DEBUG: Page is rendering! Loading: {isLoading ? 'YES' : 'NO'}, Packets: {packets.length}, Error: {error || 'none'}
        </div>
        
        {isLoading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            color: '#999',
            fontSize: '1.1rem'
          }}>
            Loading packets...
          </div>
        )}
        
        {!isLoading && (
          <>
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                id="search-input"
                placeholder="Search packets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  color: '#fff',
                  flex: '1',
                  minWidth: '200px'
                }}
              />
              <button
                onClick={handleSearch}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#3699ff',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Search
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ff4d4f',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
              {scanningState === 'idle' ? (
                <button
                  onClick={handleStartScanning}
                  style={{
                    padding: '0.5rem 1.5rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#238636',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Start Scanning
                </button>
              ) : scanningState === 'starting' ? (
                <button disabled style={{ padding: '0.5rem 1.5rem', opacity: 0.6 }}>
                  Starting...
                </button>
              ) : scanningState === 'scanning' ? (
                <button
                  onClick={handleStopScanning}
                  style={{
                    padding: '0.5rem 1.5rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#ff4d4f',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Stop Scanning
                </button>
              ) : (
                <button disabled style={{ padding: '0.5rem 1.5rem', opacity: 0.6 }}>
                  Stopping...
                </button>
              )}
            </div>

            <div style={{ background: '#1a1a1a', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0d1117', borderBottom: '1px solid #333' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedRows.length === packets.length && packets.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Status</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Date</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Source IP</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Dest IP</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Protocol</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Description</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: '#fff', fontSize: '0.9rem' }}>Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {packets.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                        {scanningState === 'scanning' ? (
                          <div>
                            <p style={{ fontSize: '1.1rem', marginBottom: '10px', color: '#fff' }}>📡 Scanning for packets...</p>
                            <p style={{ fontSize: '0.9rem' }}>Waiting for network traffic. Try browsing the site or running an attack from Kali Linux.</p>
                          </div>
                        ) : scanningState === 'starting' ? (
                          <p style={{ fontSize: '1.1rem', color: '#fff' }}>🚀 Starting packet capture...</p>
                        ) : (
                          <div>
                            <p style={{ fontSize: '1.1rem', marginBottom: '10px', color: '#fff' }}>No packets captured yet</p>
                            <p style={{ fontSize: '0.9rem' }}>Click "Start Scanning" to begin capturing network traffic.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    packets.map((packet: Packet) => {
                      const statusColor = getStatusColor(packet.status);
                      const statusBg = statusColor === 'error' ? '#ff4d4f' : statusColor === 'warning' ? '#faad14' : '#52c41a';
                      return (
                        <tr
                          key={packet._id}
                          style={{
                            borderBottom: '1px solid #333',
                            background: selectedRows.includes(packet._id) ? '#1f2940' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '0.75rem' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedRows.includes(packet._id)}
                              onChange={() => toggleRowSelection(packet._id)}
                            />
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: statusBg,
                              color: '#fff',
                              fontSize: '0.85rem'
                            }}>
                              {packet.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', color: '#e6edf3' }}>{new Date(packet.date).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem', color: '#e6edf3', fontFamily: 'monospace' }}>{packet.start_ip}</td>
                          <td style={{ padding: '0.75rem', color: '#e6edf3', fontFamily: 'monospace' }}>{packet.end_ip}</td>
                          <td style={{ padding: '0.75rem', color: '#e6edf3' }}>{packet.protocol}</td>
                          <td style={{ padding: '0.75rem', color: '#e6edf3', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{packet.description}</td>
                          <td style={{ padding: '0.75rem', color: '#e6edf3' }}>{packet.frequency}</td>
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
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowResetConfirm(false)}
          >
            <div 
              style={{
                background: '#1a1a1a',
                padding: '2rem',
                borderRadius: '8px',
                maxWidth: '400px',
                border: '1px solid #333'
              }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Confirm Reset</h3>
              <p style={{ color: '#999', marginBottom: '1.5rem' }}>Are you sure you want to clear all packets? This action cannot be undone.</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    padding: '0.5rem 1.5rem',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: 'transparent',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    padding: '0.5rem 1.5rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#ff4d4f',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default EventsLog;
