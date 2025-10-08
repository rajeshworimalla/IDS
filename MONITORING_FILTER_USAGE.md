# 📅 Monitoring Page Calendar-Based Date Filtering Guide

## Overview
The monitoring page now features an intuitive **calendar-based date picker** that allows you to manually select date ranges for analyzing captured packets and alerts from specific time periods.

## How to Use Date Filtering

### 1. **Date Range Picker Location**
- Navigate to `/monitoring` page
- Look for the **"📅 Date Range"** section in the filters area
- It's located in the third column of the filters container
- Click on the date range trigger to open the calendar picker

### 2. **Calendar-Based Date Selection**
The new date picker offers multiple ways to select date ranges:

#### **Quick Range Buttons**
- **Last Hour** - Shows alerts from the past 1 hour
- **Last 24 Hours** - Shows alerts from the past 24 hours
- **Last 7 Days** - Shows alerts from the past week
- **Last 30 Days** - Shows alerts from the past month

#### **Interactive Calendar**
- **Visual calendar grid** with clickable dates
- **Month navigation** with arrow buttons
- **Today highlighting** - current date is highlighted
- **Range selection** - selected date ranges are visually highlighted
- **Two-step selection**: First click selects "From" date, second click selects "To" date

### 3. **Using the Calendar Date Picker**
1. **Click the date range trigger** (shows current selected range)
2. **Choose a quick range** or **manually select dates**:
   - Click on start date ("From" will be highlighted in blue)
   - Click on end date ("To" will be highlighted in blue)
   - Selected range will be highlighted in light blue
3. **Click "Apply"** to confirm your selection
4. **Use "Clear"** to remove date filtering
5. The picker automatically closes after applying

### 4. **Visual Features**
- **Animated calendar interface** with smooth transitions
- **Range highlighting** - selected date ranges are visually emphasized
- **Mode indicators** - shows which date (From/To) you're currently selecting
- **Today marker** - current date is clearly highlighted
- **Hover effects** - dates scale up on hover for better interaction

### 5. **Combined Filtering**
You can combine date filtering with other filters:
- **Severity filters**: Critical, High, Medium, Low
- **Status filters**: Active, Investigating, Mitigated, Resolved
- **Search**: Text-based search across alert properties

### 6. **Real-time Updates**
- Filters are applied automatically when changed
- Alert statistics update based on current filters
- No need to click "Apply" or refresh manually

## Technical Details

### Backend API
- Supports `timeRange` parameter with predefined values
- Supports custom `from` and `to` date parameters
- All dates are processed in ISO string format
- Filtering happens server-side for better performance

### Frontend Features
- TypeScript interfaces for type safety
- Framer Motion animations for smooth UX
- Responsive design works on all screen sizes
- Date inputs use `datetime-local` for precise time selection

## Troubleshooting

**Q: I don't see the date filtering section**
- Make sure you're on the `/monitoring` page
- Look for the "📅 Time Range" heading in the filters area
- It should be in the third column of the filter grid

**Q: Calendar picker isn't opening**
- Click directly on the date range trigger (the box showing the current date range)
- Make sure you're clicking on the entire trigger area, not just the text

**Q: Filtering isn't working**
- Check browser console for any JavaScript errors
- Ensure backend server is running on port 5001
- Verify database connection is working

**Q: No results showing**
- Try expanding the time range or selecting "All Time"
- Check if other filters (severity, status) are too restrictive
- Use the "Reset Filters" button to clear all filters

## Examples

1. **View last 24 hours of critical alerts:**
   - Click date range trigger → Click "Last 24 Hours" button → Apply
   - Severity: Click "Critical" chip
   
2. **Custom date range from yesterday:**
   - Click date range trigger → Navigate to yesterday on calendar
   - Click yesterday's date twice (once for From, once for To) → Apply

3. **Recent high-severity unresolved alerts:**
   - Click date range trigger → Click "Last 7 Days" button → Apply
   - Severity: "Critical" and "High"
   - Status: "Active"
   
4. **Specific date range (e.g., last weekend):**
   - Click date range trigger → Navigate to last Saturday
   - Click Saturday (From), then click Sunday (To) → Apply

The date filtering system provides flexible ways to analyze your network security alerts over time! 🎯