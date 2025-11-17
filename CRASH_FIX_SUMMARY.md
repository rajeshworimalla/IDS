# App Crash Fix - Attack Handling Resilience

## Problem
When sending attacks, the app was crashing and showing "Failed to fetch data. Please try again later." errors.

## Root Causes
1. **Prediction Service Overload**: High-volume attacks overwhelmed the ML prediction service
2. **No Circuit Breaker**: Kept trying to call failing service, causing cascading failures
3. **No Request Throttling**: All packets tried to get predictions simultaneously
4. **Short Timeout**: 5-second timeout was too short for complex predictions
5. **No Fallback**: When ML service failed, app crashed instead of using rule-based detection

## Solutions Implemented

### 1. Circuit Breaker Pattern
- **Threshold**: Opens after 5 consecutive failures
- **Timeout**: Tries again after 30 seconds
- **States**: Closed → Open → Half-Open → Closed
- **Benefit**: Prevents overwhelming a failing service

### 2. Request Queuing & Throttling
- **Max Concurrent Requests**: Limited to 10 simultaneous prediction requests
- **Queue System**: Excess requests are queued and processed as capacity frees up
- **Benefit**: Prevents service overload during high-volume attacks

### 3. Increased Timeout
- **Old**: 5 seconds
- **New**: 10 seconds
- **Benefit**: Allows more time for complex predictions

### 4. Graceful Fallback
- **When ML Service Fails**: Automatically falls back to rule-based detection
- **Rule-Based Detection**: Uses packet status (critical/medium) and description patterns
- **Benefit**: App continues working even if ML service is down

### 5. Better Error Handling
- **Prediction Service**: Global error handler prevents crashes, returns default predictions
- **Backend**: Catches all errors, logs them, continues processing
- **Benefit**: App stays running even when errors occur

## How It Works

### Normal Operation
1. Packet captured → Saved to DB
2. Request queued if at capacity
3. ML prediction requested (with timeout)
4. Results saved and broadcast

### When ML Service Fails
1. Circuit breaker records failure
2. After 5 failures → Circuit opens
3. All requests skip ML, use rule-based detection
4. After 30 seconds → Circuit half-opens (test)
5. If test succeeds → Circuit closes (back to normal)

### During High-Volume Attacks
1. First 10 packets → Processed immediately
2. Remaining packets → Queued
3. As requests complete → Queue processes next items
4. If service fails → Circuit breaker opens, uses fallback

## Files Modified
- `backend/src/services/packetCapture.ts`: Added circuit breaker, queuing, throttling
- `backend/prediction_service.py`: Added global error handler, better error responses

## Testing
1. **Normal Attack**: Should work with ML predictions
2. **High-Volume Attack**: Should queue requests, not crash
3. **ML Service Down**: Should use rule-based detection, not crash
4. **Recovery**: After ML service recovers, should resume normal operation

## Monitoring
Watch for these log messages:
- `⚠️ Circuit breaker OPENED` - ML service is failing
- `⚠️ Circuit breaker is OPEN - skipping ML prediction` - Using fallback
- `⚠️ ML service error` - Individual request failed (circuit breaker will handle)

## Next Steps
If crashes still occur:
1. Check prediction service logs: `python backend/prediction_service.py`
2. Check backend logs for circuit breaker status
3. Verify MongoDB is running and responsive
4. Check system resources (CPU, memory)

