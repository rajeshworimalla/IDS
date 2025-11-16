import { FC } from 'react';
import Navbar from '../components/Navbar';
import '../styles/EventsLog.css';

const EventsLog: FC = () => {
  console.log('[EventsLog] Component is rendering!');
  
  return (
    <div className="events-log-page">
      <Navbar />
      <main className="events-log-content">
        <div style={{
          background: '#ff0000',
          color: '#fff',
          padding: '2rem',
          margin: '2rem',
          border: '5px solid #fff',
          fontSize: '2rem',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          TRAFFIC COLLECTOR PAGE IS WORKING!
        </div>
        <h1 style={{ color: '#fff', fontSize: '2rem', margin: '2rem' }}>Traffic Collector</h1>
        <p style={{ color: '#fff', margin: '2rem' }}>If you can see this, the page is rendering correctly.</p>
      </main>
    </div>
  );
};

export default EventsLog;
