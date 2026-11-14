# Helpers loaded once into a persistent PowerShell host (see electron/lib/psHost.js).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class JV {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr e);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d);
}
"@
[void][JV]::SetProcessDPIAware()

function JV-Click([int]$x, [int]$y, [string]$btn = 'left', [int]$n = 1) {
  [void][JV]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 40
  if ($btn -eq 'right') { $d = 8; $u = 16 } else { $d = 2; $u = 4 }
  for ($i = 0; $i -lt $n; $i++) {
    [JV]::mouse_event($d, 0, 0, 0, [UIntPtr]::Zero)
    [JV]::mouse_event($u, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
  }
}
function JV-Move([int]$x, [int]$y) { [void][JV]::SetCursorPos($x, $y) }
function JV-Scroll([int]$amount) { [JV]::mouse_event(0x800, 0, 0, $amount, [UIntPtr]::Zero) }
function JV-Keys([string]$keys) { [System.Windows.Forms.SendKeys]::SendWait($keys) }
function JV-Win([int]$vk = 0) {
  [JV]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
  if ($vk -ne 0) {
    [JV]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
    [JV]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)
  }
  [JV]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
}
# Sends an unassigned key so Windows doesn't open the Start menu when Win is released.
function JV-Mask { [JV]::keybd_event(0xE8, 0, 0, [UIntPtr]::Zero); [JV]::keybd_event(0xE8, 0, 2, [UIntPtr]::Zero) }
function JV-VolKey([int]$vk, [int]$n) {
  for ($i = 0; $i -lt $n; $i++) {
    [JV]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
    [JV]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)
  }
}
# Each volume key press is a 2% step: go to zero, then climb.
function JV-SetVolume([int]$pct) { JV-VolKey 0xAE 50; JV-VolKey 0xAF ([int][Math]::Round($pct / 2)) }
function JV-Mute { JV-VolKey 0xAD 1 }
function JV-Dark([bool]$dark) {
  $v = if ($dark) { 0 } else { 1 }
  $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
  Set-ItemProperty $k AppsUseLightTheme $v
  Set-ItemProperty $k SystemUsesLightTheme $v
}
function JV-IsDark {
  $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
  (Get-ItemProperty $k).AppsUseLightTheme -eq 0
}
function JV-Wallpaper([string]$p) { [void][JV]::SystemParametersInfo(20, 0, $p, 3) }
function JV-Open([string]$name) {
  try { Start-Process $name } catch { Start-Process cmd -ArgumentList '/c', 'start', '""', $name -WindowStyle Hidden }
}
