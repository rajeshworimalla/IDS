@echo off
REM MongoDB SSH Tunnel - Auto-start script
REM This creates an SSH tunnel so MongoDB Compass can connect via localhost

echo Starting MongoDB SSH Tunnel...
echo.
echo This window must stay open for MongoDB Compass to work.
echo Minimize this window, but don't close it.
echo.
echo To stop the tunnel, close this window or press Ctrl+C
echo.

REM Replace with your VM IP and username
ssh -L 27017:localhost:27017 mausham04@192.168.100.4

pause

