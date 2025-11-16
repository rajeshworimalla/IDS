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
}

const DataTable: React.FC<DataTableProps> = ({ data, isLoading }) => {
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

  // Show all data (filtering happens here)
  const filteredData = data.filter(item => {
    const matchesSearch = Object.values(item).some(
      value => value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = selectedStatus.length === 0 || selectedStatus.includes(item.status);
    return matchesSearch && matchesStatus;
  });

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
            {filteredData.map((row) => (
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
    </div>
  );
};

export default DataTable; 