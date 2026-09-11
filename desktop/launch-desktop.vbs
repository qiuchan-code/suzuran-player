' Suzuran Player - Desktop Wallpaper - silent launcher
' ===================================================
' Launches Electron via wscript so NO console window flashes.
'
' Why not a .bat: double-clicking a .bat flashes a black box, which is
' ugly at logon.
'
' IMPORTANT: do NOT use Start-Process -WindowStyle Hidden for this app.
' That hides the Electron BrowserWindow too and the wallpaper never shows.
' The `0` in shell.Run below means "hide the console", which is fine.
'
' Usage:
'   double-click this file            -> silent start
'   cscript launch-desktop.vbs 15     -> wait 15s first (used at logon)
'
' Log: desktop\logs\desktop.log
'
' NOTE: this file is intentionally ASCII-only. VBScript is decoded as ANSI
' (GBK on a Chinese Windows), so UTF-8 Chinese comments turn into mojibake
' AND swallow line breaks, which breaks the whole script. Keep it ASCII.

Option Explicit

Dim fso, shell, here, exe, delaySec

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Directory of this script (= desktop\)
here = fso.GetParentFolderName(WScript.ScriptFullName)
exe = fso.BuildPath(here, "node_modules\electron\dist\electron.exe")

If Not fso.FileExists(exe) Then
  MsgBox "Electron not found:" & vbCrLf & exe & vbCrLf & vbCrLf & _
         "Run `npm install` in the desktop folder first.", 16, "Suzuran Player"
  WScript.Quit 1
End If

' Optional delay in seconds (used at logon to let explorer/WorkerW settle).
delaySec = 0
If WScript.Arguments.Count > 0 Then
  If IsNumeric(WScript.Arguments(0)) Then delaySec = CLng(WScript.Arguments(0))
End If

If delaySec > 0 Then WScript.Sleep delaySec * 1000

' Start with desktop\ as the working directory.
shell.CurrentDirectory = here
shell.Run """" & exe & """ .", 0, False
