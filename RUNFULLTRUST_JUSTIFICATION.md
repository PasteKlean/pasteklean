# Restricted Capability Justification: runFullTrust

## Capability being requested

`runFullTrust` (desktop bridge / full trust)

## Why this capability is required

PasteKlean is an Electron-based desktop clipboard utility that is packaged for the Microsoft Store using the Desktop Bridge. The application must run outside the UWP sandbox in order to access the following system features that are essential to its core functionality:

- **Clipboard access** — read and write text to the Windows clipboard.
- **Global keyboard shortcut** — register a system-wide hotkey (`Ctrl+Shift+C`) to trigger clipboard cleaning.
- **System tray / notification area** — display the app icon and menu in the Windows system tray.
- **Notifications** — show optional toast notifications when the clipboard is cleaned.
- **Launch at login** — set the app to start automatically when the user signs in.

These features cannot be implemented within the UWP sandbox and therefore require the `runFullTrust` restricted capability.

## What the app does not do

- It does not access, collect, or transmit personal information.
- It does not access files, network, camera, microphone, or user identity.
- It does not run arbitrary code or perform any system-level modifications.
- The only capability declared in the `AppxManifest.xml` is `runFullTrust`.

The capability is declared solely to allow the packaged desktop application to run with the privileges necessary to perform local clipboard-cleaning operations.
