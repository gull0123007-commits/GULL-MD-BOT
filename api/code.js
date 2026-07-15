const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

export default async function handler(req, res) {
    const { number } = req.query;

    if (!number) {
        return res.status(400).json({ error: "Phone number is required." });
    }

    // Number ko clean karein (e.g. 923170066159 format)
    const cleanNumber = number.replace(/[^0-9]/g, "");
    const sessionDir = path.join("/tmp", `session_${cleanNumber}`);
    
    // Purani session files clear karein taake fresh login request trigger ho
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        const sock = makeWASocket({
            // 1. WhatsApp Web core engine and browser definition setup karein
            version: [2, 3000, 1015901307], // Latest API standard target
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // Pairing code ke liye ye browser config perfect kaam karti hai:
            browser: ["Ubuntu", "Chrome", "20.0.04"] 
        });

        // Credentials save handler
        sock.ev.on("creds.update", async () => {
            await saveCreds();
        });

        // 2. Thoda extra delay dein taake background connections open ho sakein
        await delay(3500); 

        if (!sock.authState.creds.registered) {
            // 3. Requesting Pairing Code
            const code = await sock.requestPairingCode(cleanNumber);
            
            // Code return karne se pehle creds save hone ka thoda wait karein
            await delay(1500); 
            
            return res.status(200).json({ code: code });
        } else {
            return res.status(200).json({ error: "Device already registered." });
        }

    } catch (err) {
        console.error("Error in connection pairing:", err);
        return res.status(500).json({ error: "Server Error: Connection timed out or failed." });
    }
}

