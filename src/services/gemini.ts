import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Scene {
  text: string;
  imagePrompt: string;
  audioPrompt: string;
  imageUrl?: string;
  audioUrl?: string;
}

export async function generateStoryStructure(prompt: string): Promise<Scene[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Create a short, engaging story based on this prompt: "${prompt}". 
    Break the story into 3-5 distinct scenes. 
    For each scene, provide:
    1. The story text for that scene (narrative).
    2. A detailed visual prompt for an image generator.
    3. A brief instruction for the narrator (e.g., "Speak mysteriously", "Speak excitedly").
    Return the result as a JSON array of objects with keys: "text", "imagePrompt", "audioPrompt".`,
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

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse story structure", e);
    return [];
  }
}

export async function generateSceneImage(imagePrompt: string): Promise<string | undefined> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
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
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return undefined;
}

export async function generateSceneAudio(text: string, audioPrompt: string): Promise<string | undefined> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
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

    // If it's raw PCM (common for Gemini TTS), we need to wrap it in a WAV header for the <audio> tag
    if (mimeType.includes('pcm')) {
      return pcmToWavDataUri(base64Data, 24000);
    }

    return `data:${mimeType};base64,${base64Data}`;
  }
  return undefined;
}

function pcmToWavDataUri(base64Pcm: string, sampleRate: number): string {
  const binaryString = atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (PCM = 1)
  view.setUint16(20, 1, true);
  // channel count (Mono = 1)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample (16-bit)
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, len, true);

  // Combine header and data
  const wavBytes = new Uint8Array(44 + len);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(bytes, 44);

  // Convert back to base64 for data URI
  let binary = '';
  for (let i = 0; i < wavBytes.byteLength; i++) {
    binary += String.fromCharCode(wavBytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
