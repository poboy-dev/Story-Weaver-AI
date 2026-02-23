/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Wand2, BookOpen, RotateCcw, Loader2, LogOut, History, User } from 'lucide-react';
import { generateStoryStructure, generateSceneImage, generateSceneAudio, Scene, fetchHistory, fetchStoryById } from './services/gemini';
import StoryPlayer from './components/StoryPlayer';
import Auth from './components/Auth';
import { cn } from './lib/utils';

type AppState = 'idle' | 'weaving' | 'playing' | 'finished';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMasterpiece, setIsMasterpiece] = useState(false);

  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('username'));
  const [history, setHistory] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (token) {
      loadHistory();
    }
  }, [token]);

  const loadHistory = async () => {
    if (!token) return;
    const items = await fetchHistory(token);
    setHistory(items);
  };

  const handleAuth = (token: string, username: string) => {
    setToken(token);
    setUsername(username);
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
  };

  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    reset();
  };

  const handleLoadStory = async (id: number) => {
    if (!token) return;
    setState('weaving');
    setCurrentStep('Retrieving your story from the archives...');
    try {
      const storyScenes = await fetchStoryById(id, token);
      // Historical stories might already have assets, or we might need to load them
      setScenes(storyScenes);
      setState('playing');
      setIsSidebarOpen(false);
    } catch (err: any) {
      setError("Failed to load story.");
      setState('idle');
    }
  };

  const handleLoadScene = async (index: number) => {
    const scene = scenes[index];
    if (scene.imageUrl && scene.audioUrl) return;

    try {
      const { generateSceneAssets } = await import('./services/gemini');
      const updatedScene = await generateSceneAssets(scene, isMasterpiece);
      setScenes(prev => {
        const newScenes = [...prev];
        newScenes[index] = updatedScene;
        return newScenes;
      });
    } catch (err) {
      console.error("Failed to load assets for scene", index, err);
    }
  };

  const handleWeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setState('weaving');
    setError(null);
    setScenes([]);

    try {
      setCurrentStep('Architecting the narrative...');
      const structure = await generateStoryStructure(prompt, token || undefined);

      if (structure.length === 0) {
        throw new Error("Failed to create story structure. Please try again.");
      }

      setScenes(structure);
      setState('playing');
      if (token) loadHistory(); // Refresh history
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      setState('idle');
    }
  };

  const reset = () => {
    setState('idle');
    setPrompt('');
    setScenes([]);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_50%,#18181b_0%,#09090b_100%)] relative overflow-hidden">
      {/* Auth Check */}
      {!token ? (
        <Auth onAuth={handleAuth} />
      ) : (
        <>
          {/* Header/Nav */}
          <div className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all flex items-center gap-2"
              >
                <History size={20} />
                <span className="text-xs uppercase tracking-widest font-bold hidden md:block">History</span>
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300">
                <User size={16} />
                <span className="text-sm font-medium">{username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2"
              >
                <LogOut size={20} />
                <span className="text-xs uppercase tracking-widest font-bold hidden md:block">Logout</span>
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <AnimatePresence>
            {isSidebarOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsSidebarOpen(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                />
                <motion.div
                  initial={{ x: -300 }}
                  animate={{ x: 0 }}
                  exit={{ x: -300 }}
                  className="fixed top-0 left-0 bottom-0 w-80 bg-zinc-950 border-r border-white/10 z-[70] p-6 flex flex-col gap-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-serif text-white">Your Chronicles</h3>
                    <motion.button
                      whileHover={{ rotate: 90 }}
                      onClick={() => setIsSidebarOpen(false)}
                      className="text-zinc-500 hover:text-white"
                    >
                      <RotateCcw size={20} />
                    </motion.button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {history.length === 0 ? (
                      <p className="text-zinc-600 text-sm italic text-center py-10">No stories woven yet...</p>
                    ) : (
                      history.map((story) => (
                        <button
                          key={story.id}
                          onClick={() => handleLoadStory(story.id)}
                          className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                        >
                          <p className="text-white font-medium text-sm line-clamp-2 group-hover:text-sparkle">{story.title}</p>
                          <p className="text-zinc-500 text-[10px] mt-1 uppercase tracking-wider">{new Date(story.created_at).toLocaleDateString()}</p>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {state === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-2xl text-center space-y-8"
              >
                <div className="space-y-4">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center justify-center p-3 rounded-2xl bg-white/5 border border-white/10 mb-4"
                  >
                    <Wand2 className="text-white w-8 h-8" />
                  </motion.div>
                  <h1 className="text-5xl md:text-7xl font-serif font-bold tracking-tight text-white">
                    StoryWeaver <span className="text-zinc-500">AI</span>
                  </h1>
                  <p className="text-zinc-400 text-lg md:text-xl max-w-lg mx-auto font-light">
                    Enter a spark of an idea, and watch as we weave it into a living, breathing story.
                  </p>
                </div>

                <form onSubmit={handleWeave} className="relative group">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A lonely robot finds a forgotten garden on Mars..."
                    className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-lg"
                  />
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className="absolute right-2 top-2 bottom-2 px-6 bg-white text-black rounded-xl font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    <Sparkles size={18} />
                    Weave
                  </button>
                </form>

                <div className="flex items-center justify-center gap-4 py-2">
                  <button
                    onClick={() => setIsMasterpiece(false)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                      !isMasterpiece ? "bg-white/10 text-white border border-white/20" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    Draft Mode (Fast)
                  </button>
                  <button
                    onClick={() => setIsMasterpiece(true)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                      isMasterpiece ? "bg-sparkle/20 text-sparkle border border-sparkle/30" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    <Sparkles size={14} />
                    Masterpiece
                  </button>
                </div>

                {error && (
                  <p className="text-red-400 text-sm bg-red-400/10 py-2 px-4 rounded-lg inline-block">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap justify-center gap-3 pt-4">
                  {['Cyberpunk detective noir', 'A dragon who loves baking', 'The last library in the universe'].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setPrompt(suggestion)}
                      className="text-xs uppercase tracking-widest font-semibold text-zinc-500 hover:text-white transition-colors border border-zinc-800 hover:border-zinc-600 px-3 py-1.5 rounded-full"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {state === 'weaving' && (
              <motion.div
                key="weaving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-8 text-center"
              >
                <div className="relative">
                  <div className="absolute inset-0 blur-3xl bg-white/10 rounded-full animate-pulse" />
                  <Loader2 className="w-16 h-16 text-white animate-spin relative z-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-serif italic text-white">{currentStep}</h2>
                  <p className="text-zinc-500 text-sm uppercase tracking-[0.2em]">Weaving the threads of imagination</p>
                </div>
              </motion.div>
            )}

            {state === 'playing' && (
              <motion.div
                key="playing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-6xl space-y-6"
              >
                <div className="flex items-center justify-between px-4">
                  <div className="flex items-center gap-3">
                    <BookOpen className="text-zinc-500" size={20} />
                    <span className="text-zinc-500 uppercase tracking-widest text-xs font-bold">Now Playing</span>
                  </div>
                  <button
                    onClick={reset}
                    className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"
                  >
                    <RotateCcw size={16} />
                    Start Over
                  </button>
                </div>
                <StoryPlayer
                  scenes={scenes}
                  onComplete={() => setState('finished')}
                  onLoadScene={handleLoadScene}
                />
              </motion.div>
            )}

            {state === 'finished' && (
              <motion.div
                key="finished"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-8"
              >
                <div className="space-y-4">
                  <h2 className="text-4xl font-serif text-white">The End</h2>
                  <p className="text-zinc-400">Your story has been woven into the tapestry of time.</p>
                </div>
                <button
                  onClick={reset}
                  className="px-8 py-4 bg-white text-black rounded-2xl font-bold hover:scale-105 transition-transform flex items-center gap-3 mx-auto"
                >
                  <RotateCcw size={20} />
                  Weave Another Tale
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <footer className="fixed bottom-8 text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-bold">
        Powered by Gemini 2.0 Flash
      </footer>
    </div>
  );
}
