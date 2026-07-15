const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

// 1. Vercel timeout limit barhane ke liye config export karein
export const config = {
    maxDuration: 60, 
};

export default async function handler(req, res) {
    const { number } = req.query;

    if (!number) {
        return res.status(400).json({ error: "Phone number is required." });
    }

    const cleanNumber = number.replace(/[^0-9]/g, "");
    const sessionDir = path.join("/tmp", `session_${cleanNumber}`);
    
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        const sock = makeWASocket({
            version: [2, 3000, 1015901307], // Latest API setup
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        sock.ev.on("creds.update", async () => {
            await saveCreds();
        });

        // Socket connection open hone ke liye thoda delay
        await delay(3000);

        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanNumber);
            
            // Session database/creds check backup ke liye minor delay
            await delay(1500);
            
            return res.status(200).json({ code: code });
        } else {
            return res.status(200).json({ error: "Device already registered." });
        }

    } catch (err) {
        console.error("Connection Error details:", err);
        return res.status(500).json({ error: "Server Error: Connection timed out or failed." });
    }
}
