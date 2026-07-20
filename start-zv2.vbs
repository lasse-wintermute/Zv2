' Zv2 launcher — starts the whole stack with NO visible windows.
' Double-click this file to start: MariaDB (if not running), the PHP API on
' 127.0.0.1:8124, and the Vite client on http://127.0.0.1:5273
' To stop the servers later: Task Manager -> end "php.exe", "node.exe", "mysqld.exe".
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")

' MariaDB (exits harmlessly if one is already running)
sh.Run """C:\xampp\mysql\bin\mysqld.exe"" --defaults-file=C:\xampp\mysql\bin\my.ini --standalone", 0, False
WScript.Sleep 2000

' PHP API
sh.Run """C:\xampp\php\php.exe"" -d display_errors=0 -S 127.0.0.1:8124 -t """ & root & """", 0, False

' Vite client
sh.CurrentDirectory = root
sh.Run "cmd /c npm run dev", 0, False
