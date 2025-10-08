# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Full-stack IDS app with three parts:
  - frontend/: React + TypeScript + Vite UI (port 5173 in dev) that talks to the backend via /api and websockets.
  - backend/: Node.js + Express + TypeScript API (default port 5001) with Socket.IO, MongoDB via Mongoose, and on-host packet capture via the cap module. It enriches captured packets using a local ML prediction service.
  - backend/prediction_service.py: Flask app (port 5002) that loads two pre-trained models (binary_attack_model.pkl and multiclass_attack_model.pkl) and exposes /predict for inference.

Development commands
- Prerequisites
  - MongoDB running locally at mongodb://127.0.0.1:27017/ids (overridable; see backend/src/config/env.ts)
  - Node.js (backend and frontend)
  - Python 3 (for the ML prediction service)

- Install dependencies
  - Backend
    - cd backend && npm ci
  - Frontend
    - cd frontend && npm ci
  - Prediction service (Python)
    - python3 -m venv backend/venv
    - source backend/venv/bin/activate
    - pip install -r backend/requirements.txt

- Run in development
  - Backend (Express + Socket.IO)
    - cd backend && npm run dev
    - Notes: uses config defaults in backend/src/config/env.ts (MONGODB_URI, JWT_SECRET, PORT)
  - Frontend (Vite)
    - cd frontend && npm run dev
    - Vite proxy forwards /api to http://localhost:5001 (see frontend/vite.config.ts)
  - Prediction service (Flask)
    - source backend/venv/bin/activate
    - python backend/prediction_service.py

- Build
  - Backend (transpile TypeScript to dist/)
    - cd backend && npm run build
  - Frontend (type-check + bundle)
    - cd frontend && npm run build

- Start production builds
  - Backend
    - cd backend && npm start
  - Frontend preview (static preview server)
    - cd frontend && npm run preview

- Lint
  - Frontend (ESLint via flat config)
    - cd frontend && npm run lint
  - Backend
    - No linter configured; for type checks: cd backend && npx tsc --noEmit

- Tests
  - No test scripts found in either frontend or backend.

Useful scripts and utilities
- Create a test user in the database
  - cd backend && npm run create-test-user
  - Script path: backend/src/scripts/createTestUser.ts

Ports and local URLs
- Frontend (dev): http://localhost:5173
- Backend API: http://localhost:5001
- Prediction service: http://127.0.0.1:5002

High-level architecture and data flow
- Frontend UI (React + Vite)
  - Entry: frontend/src/main.tsx and App.tsx
  - Routing: react-router-dom with protected routes; authentication state stored in localStorage (token, user) and propagated via a custom 'auth-change' event.
  - API access: frontend/src/services/api.ts wraps axios with a baseURL (frontend/src/config/api.ts) and an Authorization header from localStorage. Key service modules:
    - services/auth.ts (login/register/logout, current user)
    - services/packetService.ts (alerts/packets/stats filtering)
    - services/settingsService.ts (grouped settings CRUD)
  - Vite dev proxy forwards /api requests to the backend (see frontend/vite.config.ts) to avoid CORS hassles in dev.

- Backend API (Express + Socket.IO)
  - App bootstrap: backend/src/index.ts
    - Loads env (dotenv), sets defaults from backend/src/config/env.ts, configures CORS for http://localhost:5173.
    - Routes mounted:
      - /api/auth -> backend/src/routes/auth.ts (register, login, logout, /me)
      - /api/packets -> backend/src/routes/packets.ts (list/filter/stats/alerts-style views/reset)
      - /api/settings -> handled by settings routes/controllers (grouped settings with defaults)
    - MongoDB: connects via mongoose, logs available collections, then starts HTTP server.
    - Socket.IO: initialized in backend/src/socket.ts (attached to the same HTTP server).
  - Auth: backend/src/middleware/auth.ts
    - JWT expected as Bearer token; payload includes {_id, id, role}. Uses JWT_SECRET from env or config.
  - Data models (Mongoose): backend/src/models
    - User.ts: with bcrypt hashing and comparePassword
    - Packet.ts: saved packets with protocol, status, sizes, is_malicious, attack_type, confidence, user
    - Setting.ts: grouped user settings with compound unique index (userId, groupId, settingId)
  - Packet capture pipeline (core IDS logic): backend/src/services/packetCapture.ts
    - Uses cap to capture Ethernet/IP packets, parses minimal headers to extract source/dest IP and protocol, computes frequency and simple heuristics to set status (normal/medium/critical).
    - Persists Packet documents to MongoDB and attempts non-blocking enrichment by POSTing to the prediction service at /predict. Broadcasts saved packets over Socket.IO ('new-packet').
    - Note: Packet capture may require appropriate system permissions and a supported pcap driver/library; selection logic tries available interfaces and logs diagnostics.

- ML prediction service (Flask)
  - backend/prediction_service.py
    - Loads binary and multiclass models with joblib/pickle.
    - /predict accepts a single packet or list, preprocesses into a fixed feature set, returns:
      - binary_prediction ('malicious'|'benign')
      - attack_type (e.g., 'normal', 'dos', 'probe', etc.)
      - confidence (binary and multiclass probabilistic scores, when available)

Conventions and configuration
- Backend environment defaults: backend/src/config/env.ts
  - Override via real environment variables (JWT_SECRET, MONGODB_URI, PORT) when running.
- Frontend API base URL and endpoints: frontend/src/config/api.ts
  - In dev, axios baseURL points to http://localhost:5001 and Vite proxy handles /api.
- WebSocket authentication: Socket.IO middleware verifies JWT using the same secret as HTTP routes.

Working locally end-to-end (example)
- Terminal 1 (MongoDB): ensure local mongod is running and accessible at mongodb://127.0.0.1:27017/ids
- Terminal 2 (prediction service):
  - source backend/venv/bin/activate
  - python backend/prediction_service.py
- Terminal 3 (backend API):
  - cd backend && npm run dev
- Terminal 4 (frontend UI):
  - cd frontend && npm run dev

Notes for future agents
- The repository contains a backend/venv directory with site-packages; ignore it when indexing or searching for project source.
- The packet capture module (cap) initializes a device and listens for 'packet' events; on Linux/macOS it will depend on libpcap and may require elevated privileges to capture on real interfaces.
