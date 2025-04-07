import { FC, useState } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import '../styles/EventsLog.css';

interface FilterOption {
  id: string;
  label: string;
  active: boolean;
}

interface EventData {
  id: number;
  date: string;
  endDate: string;
  startIP: string;
  endIP: string;
  protocol: string;
  description: string;
  frequency: string;
  startBytes: string;
  endBytes: string;
}

const EventsLog: FC = () => {
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter options
  const filterOptions: FilterOption[] = [
    { id: 'all', label: 'Alle', active: true },
    { id: 'open', label: 'Geöffnet', active: false },
    { id: 'closed', label: 'Geschlossen', active: false },
  ];
  
  // Mock events data
  const eventsData: EventData[] = [
    { id: 1, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'HTTP', description: 'Lorem ipsum dolor sit amet, consectetur adipiscing', frequency: '1.452/2', startBytes: '118', endBytes: '94' },
    { id: 2, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'HTTPS', description: 'Sed do eiusmod tempor incididunt ut labore et dolore', frequency: '566', startBytes: '89', endBytes: '120' },
    { id: 3, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'FTP', description: 'Magna aliqua. Ut enim ad minim veniam, quis nostrud', frequency: '39', startBytes: '74', endBytes: '102' },
    { id: 4, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'SSH', description: 'Exercitation ullamco laboris nisi ut aliquip ex ea', frequency: '144', startBytes: '95', endBytes: '120' },
    { id: 5, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'ICMP', description: 'Commodo consequat', frequency: '403', startBytes: '110', endBytes: '78' },
    { id: 6, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'HTTPS', description: 'Lorem ipsum dolor sit amet, consectetur adipiscing', frequency: '122', startBytes: '112', endBytes: '94' },
    { id: 7, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'HTTP', description: 'Sed do eiusmod tempor incididunt ut labore et dolore', frequency: '256', startBytes: '85', endBytes: '120' },
    { id: 8, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'HTTPS', description: 'Magna aliqua. Ut enim ad minim veniam, quis nostrud', frequency: '39', startBytes: '74', endBytes: '102' },
    { id: 9, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'SSH', description: 'Exercitation ullamco laboris nisi ut aliquip ex ea', frequency: '144', startBytes: '95', endBytes: '120' },
    { id: 10, date: '20.03.2024', endDate: '20.03.2024', startIP: '10.98.106.154', endIP: '10.99.120.1', protocol: 'ICMP', description: 'Commodo consequat', frequency: '403', startBytes: '110', endBytes: '78' },
  ];

  const toggleRowSelection = (id: number) => {
    setSelectedRows(prev => 
      prev.includes(id)
        ? prev.filter(rowId => rowId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedRows.length === eventsData.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(eventsData.map(item => item.id));
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
                    checked={selectedRows.length === eventsData.length}
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
              {eventsData.map((event, index) => (
                <motion.tr 
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className={selectedRows.includes(event.id) ? 'selected' : ''}
                >
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedRows.includes(event.id)}
                      onChange={() => toggleRowSelection(event.id)}
                    />
                  </td>
                  <td>
                    <span className={`status-indicator ${index % 3 === 0 ? 'error' : index % 3 === 1 ? 'warning' : 'success'}`}></span>
                  </td>
                  <td>{event.date}</td>
                  <td>{event.endDate}</td>
                  <td>{event.startIP}</td>
                  <td>{event.endIP}</td>
                  <td>{event.protocol}</td>
                  <td className="description-cell">{event.description}</td>
                  <td>{event.frequency}</td>
                  <td>{event.startBytes}</td>
                  <td>{event.endBytes}</td>
                </motion.tr>
              ))}
            </tbody>
          </motion.table>
        </div>
        
        <div className="pagination-controls">
          <div className="records-info">Anzeige 1-10 von 435</div>
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