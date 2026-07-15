' Launches Quiet Reader without showing a console window.

Dim shell, fso, scriptDir, ps1, command, index, argument

Set shell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(scriptDir, "Open-InViewer.ps1")

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"

For index = 0 To WScript.Arguments.Count - 1
  argument = WScript.Arguments(index)
  command = command & " """ & Replace(argument, """", """""") & """"
Next

shell.Run command, 0, False
