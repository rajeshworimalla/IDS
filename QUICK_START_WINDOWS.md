# 🚀 QUICK START FOR WINDOWS - PRESENTATION MODE

## ⚡ FASTEST WAY TO GET RUNNING (3 MINUTES)

### Option 1: Use the Startup Script (EASIEST)
1. Right-click on `start-windows.ps1`
2. Select "Run with PowerShell"
3. Wait for services to start
4. Open http://localhost:5173 in your browser

### Option 2: Manual Start (If script doesn't work)

**Step 1: Start Backend**
```powershell
cd backend
npm install  # Only if you haven't done this
npm run build  # Only if dist/ folder doesn't exist
npm start
```
Keep this window open!

**Step 2: Start Frontend (NEW TERMINAL)**
```powershell
cd frontend
npm install  # Only if you haven't done this
npm run dev
```
Keep this window open!

**Step 3: Open Browser**
- Go to: http://localhost:5173
- The app should load!

## 🎯 WHAT TO SHOW IN YOUR PRESENTATION

### 1. **Dashboard** (Main Page)
- Shows network statistics
- Real-time packet monitoring
- Attack alerts

### 2. **Monitoring Page**
- Live packet stream
- Filter by protocol, IP, etc.

### 3. **Activities Page**
- Historical attack data
- Filter by date range

### 4. **Blocker Page**
- View blocked IPs
- Manually block/unblock IPs

### 5. **Architecture Diagram**
- You have `architecture_diagram_accurate.svg` - show this!

## 🐛 IF IT STILL DOESN'T WORK

### Backend won't start?
- Check if MongoDB is running (port 27017)
- Check if port 5001 is already in use
- Look at the error message in the backend window

### Frontend won't start?
- Check if port 5173 is already in use
- Make sure you ran `npm install` in the frontend folder
- Check the error message

### Can't connect to backend?
- Make sure backend is running on port 5001
- Check browser console (F12) for errors
- Backend might need MongoDB - that's okay for demo, just show the UI

## 📊 FOR YOUR PRESENTATION

Even if the backend isn't fully working, you can:
1. **Show the UI** - The frontend will still load and show the interface
2. **Show the architecture diagram** - `architecture_diagram_accurate.svg`
3. **Explain the system** - Talk about what each component does
4. **Show the code** - Point to key files:
   - `backend/src/index.ts` - Main backend server
   - `frontend/src/App.tsx` - Main frontend app
   - `backend/prediction_service.py` - ML service

## 🎤 PRESENTATION TALKING POINTS

1. **Introduction**: "This is an Intrusion Detection System that combines rule-based detection with machine learning"

2. **Architecture**: Show the diagram, explain:
   - Frontend (React) for user interface
   - Backend (Node.js) for packet capture and processing
   - ML Service (Python) for attack classification
   - MongoDB for data storage

3. **Key Features**:
   - Real-time packet monitoring
   - Attack detection (DoS, Port Scan, Brute Force, etc.)
   - Automatic IP blocking
   - Historical data analysis

4. **Demo**: Walk through the UI pages

5. **Technical Highlights**:
   - TypeScript for type safety
   - WebSocket for real-time updates
   - Machine learning models for classification
   - RESTful API design

## 💡 QUICK FIXES

**"Cannot find module" errors:**
```powershell
cd backend
npm install
cd ../frontend
npm install
```

**"Port already in use":**
- Close other applications using those ports
- Or change ports in config files

**"MongoDB connection failed":**
- For demo purposes, you can still show the UI
- The frontend will work even if backend has connection issues
- Just explain that MongoDB is needed for data persistence

## ✅ CHECKLIST BEFORE PRESENTATION

- [ ] Frontend runs (`npm run dev` in frontend folder)
- [ ] Can open http://localhost:5173 in browser
- [ ] UI loads (even if backend isn't connected)
- [ ] Architecture diagram ready to show
- [ ] Know what each page does
- [ ] Have talking points ready

## 🆘 LAST RESORT

If nothing works, you can:
1. Show screenshots of the UI
2. Show the architecture diagram
3. Walk through the code structure
4. Explain the system design
5. Discuss the technologies used

**Remember: Even if the app doesn't run perfectly, you can still give a great presentation by explaining the architecture, design decisions, and showing the code!**

