# Steply mobile connection fix

If the QR payload shows `192.168.56.1`, the app is using a VirtualBox/host-only adapter. Phones on normal Wi-Fi cannot reach that address.

This patch changes the PC server URL selection so the QR payload prefers real Wi-Fi/LAN IPv4 addresses and deprioritizes VirtualBox/Docker/WSL/link-local adapters.

## Run

```bash
npm install
npm run dev
```

Then create a new QR session. The QR payload should now show your PC Wi-Fi/LAN address, for example `192.168.0.x`, not `192.168.56.1`.

## Manual override

If Windows still chooses the wrong network adapter, start the server with your real PC IP:

PowerShell:

```powershell
$env:STEPLY_HOST="YOUR_PC_IP"
npm run dev
```

or force the full server URL:

```powershell
$env:STEPLY_SERVER_URL="http://YOUR_PC_IP:3000"
npm run dev
```

Also make sure Windows Firewall allows Node.js on private networks and both devices are on the same Wi-Fi/LAN.
