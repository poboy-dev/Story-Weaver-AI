import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { Scene } from '../services/gemini';
import { cn } from '../lib/utils';

interface StoryPlayerProps {
  scenes: Scene[];
  onComplete: () => void;
  onLoadScene?: (index: number) => Promise<void>;
}

export default function StoryPlayer({ scenes, onComplete, onLoadScene }: StoryPlayerProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentScene = scenes[currentSceneIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let isMounted = true;

    const playAudio = async () => {
      if (isPlaying && currentScene.audioUrl) {
        if (currentScene.audioUrl.startsWith('tts://')) {
          const text = currentScene.audioUrl.replace('tts://', '');
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.onend = () => {
            if (isMounted) handleAudioEnded();
          };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          return;
        }

        try {
          // Only change src if it's different to avoid unnecessary reloads
          if (audio.src !== currentScene.audioUrl) {
            audio.pause();
            audio.src = currentScene.audioUrl;
            audio.load();
          }

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
        } catch (err: any) {
          // AbortError is expected when play() is interrupted
          if (err.name !== 'AbortError' && isMounted) {
            console.error("Audio playback error:", err);
          }
        }
      } else {
        audio.pause();
        window.speechSynthesis.cancel();
      }
    };

    if (!currentScene.imageUrl || !currentScene.audioUrl) {
      if (onLoadScene) {
        onLoadScene(currentSceneIndex).then(() => {
          if (isMounted) playAudio();
        });
      }
    } else {
      playAudio();
    }

    return () => {
      isMounted = false;
      audio.pause();
    };
  }, [currentSceneIndex, isPlaying, currentScene.audioUrl]);

  const handleAudioEnded = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      onComplete();
    }
  };

  const togglePlay = () => setIsPlaying(!isPlaying);
  const toggleMute = () => setIsMuted(!isMuted);

  const nextScene = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    }
  };

  const prevScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(prev => prev - 1);
    }
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSceneIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          {currentScene.imageUrl ? (
            <img
              src={currentScene.imageUrl}
              alt={`Scene ${currentSceneIndex + 1}`}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
              <div className="animate-pulse text-zinc-500">Visualizing...</div>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-xl md:text-2xl lg:text-3xl font-serif text-white leading-relaxed text-center max-w-4xl mx-auto drop-shadow-lg"
            >
              {currentScene.text}
            </motion.p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Controls */}
      <div className="absolute top-6 right-6 flex items-center gap-4 z-20">
        <button
          onClick={toggleMute}
          className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-colors"
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 z-20">
        <button
          onClick={prevScene}
          disabled={currentSceneIndex === 0}
          className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 disabled:opacity-30 transition-all"
        >
          <SkipBack size={24} />
        </button>

        <button
          onClick={togglePlay}
          className="p-4 rounded-full bg-white text-black hover:scale-105 transition-transform shadow-xl"
        >
          {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </button>

        <button
          onClick={nextScene}
          disabled={currentSceneIndex === scenes.length - 1}
          className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 disabled:opacity-30 transition-all"
        >
          <SkipForward size={24} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-30">
        <motion.div
          className="h-full bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${((currentSceneIndex + 1) / scenes.length) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        muted={isMuted}
        autoPlay={isPlaying}
      />
    </div>
  );
}
