import { FC, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Search as SearchIcon,
  FilterList as FilterIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import '../styles/DataTable.css';

interface TableData {
  id: number;
  date: string;
  endDate: string;
  ip: string;
  port: string;
  protocol: string;
  status: 'warning' | 'error' | 'info' | 'success';
  message: string;
  severity: string;
}

const DataTable: FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

  const mockData: TableData[] = [
    { id: 1, date: '20.03.2024', endDate: '20.03.2024', ip: '10.98.106.154', port: '8080', protocol: 'HTTP', status: 'error', message: 'ET CMS Active Threat Intelligence Poor', severity: '1/5' },
    { id: 2, date: '20.03.2024', endDate: '20.03.2024', ip: '10.98.106.154', port: '443', protocol: 'HTTPS', status: 'warning', message: 'Reputation IP group 11', severity: '2/5' },
    { id: 3, date: '20.03.2024', endDate: '20.03.2024', ip: '10.98.106.154', port: '80', protocol: 'HTTP', status: 'info', message: 'SURICATA STREAM excessive retransmissions', severity: '1/5' },
    // Add more mock data as needed
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckIcon className="status-icon success" />;
      case 'warning':
        return <WarningIcon className="status-icon warning" />;
      case 'error':
        return <ErrorIcon className="status-icon error" />;
      case 'info':
        return <InfoIcon className="status-icon info" />;
      default:
        return null;
    }
  };

  const filteredData = mockData.filter(item => {
    const matchesSearch = Object.values(item).some(
      value => value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = selectedStatus.length === 0 || selectedStatus.includes(item.status);
    return matchesSearch && matchesStatus;
  });

  const tableVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const rowVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  return (
    <div className="data-table-container">
      <motion.div 
        className="table-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="search-bar">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-section">
          <FilterIcon />
          <div className="status-filters">
            {['error', 'warning', 'info', 'success'].map((status) => (
              <motion.button
                key={status}
                className={`filter-btn ${selectedStatus.includes(status) ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatus(prev => 
                    prev.includes(status)
                      ? prev.filter(s => s !== status)
                      : [...prev, status]
                  );
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {getStatusIcon(status)}
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div 
        className="table-wrapper"
        variants={tableVariants}
        initial="hidden"
        animate="visible"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Date</th>
              <th>End Date</th>
              <th>IP</th>
              <th>Port</th>
              <th>Protocol</th>
              <th>Message</th>
              <th>Severity</th>
            </tr>
          </thead>
          <motion.tbody>
            {filteredData.map((row) => (
              <motion.tr
                key={row.id}
                variants={rowVariants}
                whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
              >
                <td>{getStatusIcon(row.status)}</td>
                <td>{row.date}</td>
                <td>{row.endDate}</td>
                <td>{row.ip}</td>
                <td>{row.port}</td>
                <td>{row.protocol}</td>
                <td>{row.message}</td>
                <td>{row.severity}</td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </motion.div>
    </div>
  );
};

export default DataTable; 