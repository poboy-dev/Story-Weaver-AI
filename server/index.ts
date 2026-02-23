import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthRequest extends Request {
    user?: { id: number; username: string };
}

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return next(); // Continue without user if no token

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
};

app.use(authenticateToken);

const port = process.env.PORT || 8080;
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not set.");
}

const ai = new GoogleGenAI({ apiKey });

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
        const result = stmt.run(username, hashedPassword);

        const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET);
        res.status(201).json({ token, username });
    } catch (error: any) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Username already exists" });
        }
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    try {
        const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
        res.json({ token, username });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stories', (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    try {
        const stories = db.prepare('SELECT id, title, created_at FROM stories WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
        res.json(stories);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stories/:id', (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    try {
        const story: any = db.prepare('SELECT * FROM stories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!story) return res.status(404).json({ error: "Story not found" });
        res.json(JSON.parse(story.data));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/story', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-lite", // Using lite for structure to save tokens (12x cheaper)
            contents: [{
                role: "user",
                parts: [{
                    text: `Create a short, engaging story based on this prompt: "${prompt}". 
      Break the story into 3-5 distinct scenes. 
      For each scene, provide:
      1. The story text for that scene (narrative).
      2. A detailed visual prompt for an image generator (avoid text in images).
      3. A brief instruction for the narrator (e.g., "Speak mysteriously", "Speak excitedly").
      Return the result as a JSON array of objects with keys: "text", "imagePrompt", "audioPrompt".`
                }]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            imagePrompt: { type: Type.STRING },
                            audioPrompt: { type: Type.STRING },
                        },
                        required: ["text", "imagePrompt", "audioPrompt"],
                    },
                },
            },
        });

        const storyData = JSON.parse(response.text || "[]");

        // Save to DB if authenticated
        const authReq = req as AuthRequest;
        if (authReq.user) {
            try {
                const title = prompt.length > 50 ? prompt.substring(0, 47) + "..." : prompt;
                const stmt = db.prepare('INSERT INTO stories (user_id, title, data) VALUES (?, ?, ?)');
                stmt.run(authReq.user.id, title, JSON.stringify(storyData));
            } catch (dbErr) {
                console.error("Failed to save story to database:", dbErr);
            }
        }

        res.json(storyData);
    } catch (error: any) {
        console.error("Story generation failed detail:", error);
        console.error("Error stack:", error.stack);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.post('/api/image', async (req, res) => {
    const { imagePrompt } = req.body;
    if (!imagePrompt) return res.status(400).json({ error: "imagePrompt is required" });

    const hash = crypto.createHash('md5').update(imagePrompt).digest('hex');

    try {
        const cached: any = db.prepare('SELECT url FROM asset_cache WHERE type = "image" AND prompt_hash = ?').get(hash);
        if (cached) {
            console.log("Image cache hit for:", hash);
            return res.json({ imageUrl: cached.url });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: {
                parts: [{ text: imagePrompt }],
            },
            config: {
                imageConfig: {
                    aspectRatio: "16:9",
                },
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
                db.prepare('INSERT INTO asset_cache (type, prompt_hash, url) VALUES ("image", ?, ?)').run(hash, imageUrl);
                return res.json({ imageUrl });
            }
        }
        res.status(404).json({ error: "No image generated" });
    } catch (error: any) {
        console.error("Image generation failed:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/audio', async (req, res) => {
    const { text, audioPrompt } = req.body;
    if (!text || !audioPrompt) return res.status(400).json({ error: "text and audioPrompt are required" });

    const contentToHash = `${audioPrompt}:${text}`;
    const hash = crypto.createHash('md5').update(contentToHash).digest('hex');

    try {
        const cached: any = db.prepare('SELECT url FROM asset_cache WHERE type = "audio" AND prompt_hash = ?').get(hash);
        if (cached) {
            console.log("Audio cache hit for:", hash);
            return res.json({ audioUrl: cached.url });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ parts: [{ text: `${audioPrompt}: ${text}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Puck" },
                    },
                },
            },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
            const base64Data = part.inlineData.data;
            const mimeType = part.inlineData.mimeType;

            let finalAudio = `data:${mimeType};base64,${base64Data}`;
            if (mimeType.includes('pcm')) {
                finalAudio = pcmToWavDataUri(base64Data, 24000);
            }

            db.prepare('INSERT INTO asset_cache (type, prompt_hash, url) VALUES ("audio", ?, ?)').run(hash, finalAudio);
            return res.json({ audioUrl: finalAudio });
        }
        res.status(404).json({ error: "No audio generated" });
    } catch (error: any) {
        console.error("Audio generation failed:", error);
        res.status(500).json({ error: error.message });
    }
});

function pcmToWavDataUri(base64Pcm: string, sampleRate: number): string {
    const binaryString = Buffer.from(base64Pcm, 'base64').toString('binary');
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + len, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, len, true);

    const wavBytes = Buffer.concat([Buffer.from(header), Buffer.from(bytes)]);
    return `data:audio/wav;base64,${wavBytes.toString('base64')}`;
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
