import React from 'react';
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
  _id: string;
  date: string;
  start_ip: string;
  end_ip: string;
  protocol: string;
  status: 'critical' | 'medium' | 'normal';
  description: string;
  is_malicious: boolean;
  attack_type: string;
}

interface DataTableProps {
  data: TableData[];
  isLoading: boolean;
  currentPage?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
}

const DataTable: React.FC<DataTableProps> = ({ 
  data, 
  isLoading, 
  currentPage = 1, 
  itemsPerPage = 50,
  onPageChange 
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedStatus, setSelectedStatus] = React.useState<string[]>([]);

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'critical':
        return <ErrorIcon className="status-icon error" />;
      case 'medium':
        return <WarningIcon className="status-icon warning" />;
      case 'normal':
        return <CheckIcon className="status-icon success" />;
      default:
        return <InfoIcon className="status-icon info" />;
    }
  };

  // Filter data
  const filteredData = data.filter(item => {
    const matchesSearch = Object.values(item).some(
      value => value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = selectedStatus.length === 0 || selectedStatus.includes(item.status);
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="table-loading">
        <div className="loading-spinner" />
        <p>Loading data...</p>
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="table-header">
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
            {['critical', 'medium', 'normal'].map((status) => (
              <button
                key={status}
                className={`filter-btn ${selectedStatus.includes(status) ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatus(prev => 
                    prev.includes(status)
                      ? prev.filter(s => s !== status)
                      : [...prev, status]
                  );
                }}
              >
                {getStatusIcon(status)}
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Date</th>
              <th>Source IP</th>
              <th>Destination IP</th>
              <th>Protocol</th>
              <th>Description</th>
              <th>Attack Type</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row) => (
              <tr key={row._id}>
                <td>{getStatusIcon(row.status)}</td>
                <td>{formatDate(row.date)}</td>
                <td>{row.start_ip}</td>
                <td>{row.end_ip}</td>
                <td>{row.protocol}</td>
                <td>{row.description}</td>
                <td>{row.attack_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div className="no-data">
            No data available
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {filteredData.length > itemsPerPage && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginTop: '1rem',
          padding: '1rem',
          background: 'var(--secondary-bg, #1a1a1a)',
          borderRadius: '8px'
        }}>
          <div style={{ color: 'var(--text-secondary, #999)', fontSize: '0.9rem' }}>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of {filteredData.length} items
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid rgba(255,255,255,0.2)',
                background: currentPage === 1 ? 'rgba(255,255,255,0.1)' : 'var(--accent-color, #3699ff)',
                color: '#fff',
                borderRadius: '4px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              Previous
            </button>
            <span style={{ color: 'var(--text-primary, #fff)', padding: '0 1rem' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid rgba(255,255,255,0.2)',
                background: currentPage === totalPages ? 'rgba(255,255,255,0.1)' : 'var(--accent-color, #3699ff)',
                color: '#fff',
                borderRadius: '4px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable; 