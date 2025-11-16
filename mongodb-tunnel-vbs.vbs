PS C:\Users\maush> ssh -L 27017:localhost:27017 -p 2222 mausham04@127.0.0.1 -N
kex_exchange_identification: read: Connection reset
Connection reset by 127.0.0.1 port 2222Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c mongodb-tunnel.bat", 0, False
Set WshShell = Nothing