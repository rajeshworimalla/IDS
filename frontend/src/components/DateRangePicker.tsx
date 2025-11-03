import { FC, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import '../styles/DateRangePicker.css';

interface DateRangePickerProps {
  fromDate?: Date;
  toDate?: Date;
  onDateChange: (from: Date | null, to: Date | null) => void;
  onQuickSelect?: (range: { from: Date; to: Date }) => void;
}

interface CalendarProps {
  date: Date;
  selectedDate?: Date;
  onDateSelect: (date: Date) => void;
  highlightRange?: { start: Date; end: Date };
}

const Calendar: FC<CalendarProps> = ({
  date,
  selectedDate,
  onDateSelect,
  highlightRange
}) => {
  const [currentDate, setCurrentDate] = useState(new Date(date));
  
  const today = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startingDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  
  const isDateInRange = (day: number) => {
    if (!highlightRange) return false;
    const date = new Date(year, month, day);
    return date >= highlightRange.start && date <= highlightRange.end;
  };
  
  const isDateSelected = (day: number) => {
    if (!selectedDate) return false;
    const date = new Date(year, month, day);
    return date.toDateString() === selectedDate.toDateString();
  };
  
  const isDateToday = (day: number) => {
    const date = new Date(year, month, day);
    return date.toDateString() === today.toDateString();
  };
  
  const handleDateClick = (day: number) => {
    const clickedDate = new Date(year, month, day);
    onDateSelect(clickedDate);
  };
  
  // Generate calendar days
  const calendarDays = [];
  
  // Empty cells for days before the first day of month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(
      <div key={`empty-${i}`} className="calendar-day empty"></div>
    );
  }
  
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const isSelected = isDateSelected(day);
    const isToday = isDateToday(day);
    const isInRange = isDateInRange(day);
    
    calendarDays.push(
      <motion.div
        key={day}
        className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isInRange ? 'in-range' : ''}`}
        onClick={() => handleDateClick(day)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {day}
      </motion.div>
    );
  }
  
  return (
    <div className="calendar">
      <div className="calendar-header">
        <motion.button 
          onClick={prevMonth}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          ←
        </motion.button>
        <h3>{monthNames[month]} {year}</h3>
        <motion.button 
          onClick={nextMonth}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          →
        </motion.button>
      </div>
      
      <div className="calendar-weekdays">
        {dayNames.map(day => (
          <div key={day} className="weekday">{day}</div>
        ))}
      </div>
      
      <div className="calendar-grid">
        {calendarDays}
      </div>
    </div>
  );
};

const DateRangePicker: FC<DateRangePickerProps> = ({
  fromDate,
  toDate,
  onDateChange,
  onQuickSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectingMode, setSelectingMode] = useState<'from' | 'to'>('from');
  const [tempFromDate, setTempFromDate] = useState<Date | null>(fromDate || null);
  const [tempToDate, setTempToDate] = useState<Date | null>(toDate || null);
  
  const pickerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // Handle Escape key
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
      };
      
      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        document.body.style.overflow = 'unset';
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);
  
  const quickRanges = [
    {
      label: 'Last Hour',
      getValue: () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        return { from: oneHourAgo, to: now };
      }
    },
    {
      label: 'Last 24 Hours',
      getValue: () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return { from: oneDayAgo, to: now };
      }
    },
    {
      label: 'Last 7 Days',
      getValue: () => {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: oneWeekAgo, to: now };
      }
    },
    {
      label: 'Last 30 Days',
      getValue: () => {
        const now = new Date();
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { from: oneMonthAgo, to: now };
      }
    }
  ];
  
  const handleDateSelect = (date: Date) => {
    if (selectingMode === 'from') {
      setTempFromDate(date);
      setSelectingMode('to');
    } else {
      setTempToDate(date);
      setSelectingMode('from');
    }
  };
  
  const handleQuickRange = (range: { from: Date; to: Date }) => {
    setTempFromDate(range.from);
    setTempToDate(range.to);
    onDateChange(range.from, range.to);
    if (onQuickSelect) onQuickSelect(range);
    setIsOpen(false);
  };
  
  const handleApply = () => {
    // Normalize and validate the range before applying so backend filtering works as expected
    let from = tempFromDate ? new Date(tempFromDate) : null;
    let to = tempToDate ? new Date(tempToDate) : null;

    if (from && to) {
      // Ensure chronological order
      if (from > to) {
        const tmp = from;
        from = to;
        to = tmp;
      }
      // Normalize to full-day inclusive range [startOfDay, endOfDay]
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      onDateChange(start, end);
    } else {
      // If one or both are missing, just pass through
      onDateChange(from, to);
    }

    setIsOpen(false);
  };
  
  const handleClear = () => {
    setTempFromDate(null);
    setTempToDate(null);
    onDateChange(null, null);
  };
  
  const formatDateDisplay = (from: Date | null, to: Date | null) => {
    if (!from && !to) return 'Select Date Range';
    if (!from) return `Until ${to?.toLocaleDateString()}`;
    if (!to) return `From ${from.toLocaleDateString()}`;
    return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
  };
  
  const getHighlightRange = () => {
    if (tempFromDate && tempToDate) {
      return {
        start: tempFromDate < tempToDate ? tempFromDate : tempToDate,
        end: tempFromDate < tempToDate ? tempToDate : tempFromDate
      };
    }
    return undefined;
  };
  
  return (
    <>
      <div className="date-range-picker" ref={pickerRef}>
        <motion.div
          className="date-range-trigger"
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setIsOpen(true)
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="date-range-icon">📅</span>
          <span className="date-range-text">
            {formatDateDisplay(fromDate ?? null, toDate ?? null)}
          </span>
          <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>▼</span>
        </motion.div>
      </div>
      
      {isOpen && createPortal(
        <>
          {/* Modal Backdrop */}
          <motion.div
            className="date-picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal Content */}
          <motion.div
            className="date-picker-modal"
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="date-picker-header">
              <h4>📅 Select Date Range</h4>
              <motion.button
                className="close-btn"
                onClick={() => setIsOpen(false)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                ✕
              </motion.button>
            </div>
            
            <div className="modal-body">
              <div className="mode-indicator">
                <span className={`mode-badge ${selectingMode === 'from' ? 'active' : ''}`}>
                  From: {tempFromDate?.toLocaleDateString() || 'Select'}
                </span>
                <span className={`mode-badge ${selectingMode === 'to' ? 'active' : ''}`}>
                  To: {tempToDate?.toLocaleDateString() || 'Select'}
                </span>
              </div>
              
              <div className="quick-ranges">
                <h5>Quick Ranges:</h5>
                <div className="quick-range-buttons">
                  {quickRanges.map((range) => (
                    <motion.button
                      key={range.label}
                      className="quick-range-btn"
                      onClick={() => handleQuickRange(range.getValue())}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {range.label}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              <div className="calendar-container">
                <Calendar
                  date={new Date()}
                  onDateSelect={handleDateSelect}
                  highlightRange={getHighlightRange()}
                />
              </div>
              
              <div className="date-picker-actions">
                <motion.button
                  className="clear-btn"
                  onClick={handleClear}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Clear
                </motion.button>
                <motion.button
                  className="apply-btn"
                  onClick={handleApply}
                  disabled={!tempFromDate && !tempToDate}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Apply
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>,
        document.body
      )}
    </>
  );
};

export default DateRangePicker;