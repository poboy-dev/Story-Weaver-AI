const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface Scene {
  text: string;
  imagePrompt: string;
  audioPrompt: string;
  imageUrl?: string;
  audioUrl?: string;
}

export async function generateStoryStructure(prompt: string, token?: string): Promise<Scene[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/story`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) throw new Error('Failed to generate story structure');
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch story structure", e);
    return [];
  }
}

export async function fetchHistory(token: string): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stories`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch history');
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch history", e);
    return [];
  }
}

export async function fetchStoryById(id: number, token: string): Promise<Scene[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stories/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch story');
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch story", e);
    return [];
  }
}

export async function generateSceneImage(imagePrompt: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePrompt }),
    });

    if (!response.ok) throw new Error('Failed to generate image');
    const data = await response.json();
    return data.imageUrl;
  } catch (e) {
    console.error("Failed to fetch image", e);
    return undefined;
  }
}

export async function generateSceneAudio(text: string, audioPrompt: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, audioPrompt }),
    });

    if (!response.ok) throw new Error('Failed to generate audio');
    const data = await response.json();
    return data.audioUrl;
  } catch (e) {
    console.error("Failed to fetch audio", e);
    return undefined;
  }
}

/**
 * Browser-based TTS (FREE)
 */
export async function browserTTS(text: string): Promise<string> {
  return new Promise((resolve) => {
    // In a real app, we might return a Blob URL, 
    // but for now we'll just return a special prefix
    // and handle it in the player or component
    resolve(`tts://${text}`);
  });
}

export async function generateSceneAssets(scene: Scene, isMasterpiece: boolean): Promise<Scene> {
  const [imageUrl, audioUrl] = await Promise.all([
    generateSceneImage(scene.imagePrompt),
    isMasterpiece
      ? generateSceneAudio(scene.text, scene.audioPrompt)
      : browserTTS(scene.text)
  ]);

  return {
    ...scene,
    imageUrl,
    audioUrl
  };
}

