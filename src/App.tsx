/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Wand2, BookOpen, RotateCcw, Loader2 } from 'lucide-react';
import { generateStoryStructure, generateSceneImage, generateSceneAudio, Scene } from './services/gemini';
import StoryPlayer from './components/StoryPlayer';
import { cn } from './lib/utils';

type AppState = 'idle' | 'weaving' | 'playing' | 'finished';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleWeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setState('weaving');
    setError(null);
    setScenes([]);

    try {
      setCurrentStep('Architecting the narrative...');
      const structure = await generateStoryStructure(prompt);
      
      if (structure.length === 0) {
        throw new Error("Failed to create story structure. Please try again.");
      }

      const wovenScenes: Scene[] = [];
      
      for (let i = 0; i < structure.length; i++) {
        const scene = structure[i];
        setCurrentStep(`Visualizing scene ${i + 1} of ${structure.length}...`);
        
        // Generate image and audio in parallel for each scene
        const [imageUrl, audioUrl] = await Promise.all([
          generateSceneImage(scene.imagePrompt),
          generateSceneAudio(scene.text, scene.audioPrompt)
        ]);

        wovenScenes.push({
          ...scene,
          imageUrl,
          audioUrl
        });
        
        // Update scenes progressively if we want, but for now we'll wait for all
        // to ensure a smooth playback start.
      }

      setScenes(wovenScenes);
      setState('playing');
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_50%,#18181b_0%,#09090b_100%)]">
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
            <StoryPlayer scenes={scenes} onComplete={() => setState('finished')} />
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

      <footer className="fixed bottom-8 text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-bold">
        Powered by Gemini 3.1 Pro & 2.5 Flash
      </footer>
    </div>
  );
}
