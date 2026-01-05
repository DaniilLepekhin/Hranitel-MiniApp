'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Heart,
  Clock,
  Headphones,
  X,
} from 'lucide-react';
import { meditationsApi } from '@/lib/api';
import type { Meditation } from '@/lib/api';

export function MeditationsTab() {
  const [selectedMeditation, setSelectedMeditation] = useState<Meditation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const queryClient = useQueryClient();

  const { data: meditationsData, isLoading } = useQuery({
    queryKey: ['meditations'],
    queryFn: () => meditationsApi.list(),
  });

  const logSessionMutation = useMutation({
    mutationFn: (data: { meditationId: string; durationListened: number; completed: boolean }) =>
      meditationsApi.logSession(data.meditationId, {
        durationListened: data.durationListened,
        completed: data.completed
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meditation-stats'] });
    },
  });

  const meditations = meditationsData?.meditations || [];

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      if (selectedMeditation) {
        logSessionMutation.mutate({
          meditationId: selectedMeditation.id,
          durationListened: Math.floor(audio.duration),
          completed: true,
        });
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [selectedMeditation]);

  const playMeditation = (meditation: Meditation) => {
    setSelectedMeditation(meditation);
    setShowPlayer(true);
    setCurrentTime(0);

    if (audioRef.current) {
      audioRef.current.src = meditation.audioUrl || '';
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const skip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (selectedMeditation && currentTime > 10) {
        logSessionMutation.mutate({
          meditationId: selectedMeditation.id,
          durationListened: Math.floor(currentTime),
          completed: currentTime >= duration * 0.9,
        });
      }
    }
    setShowPlayer(false);
    setIsPlaying(false);
    setSelectedMeditation(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Hidden audio element */}
      <audio ref={audioRef} />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Медитации</h1>
        <p className="text-gray-600">Найдите свой момент покоя</p>
      </div>

      {/* Featured Meditation */}
      {meditations[0] && (
        <div
          onClick={() => playMeditation(meditations[0])}
          className="relative glass rounded-3xl overflow-hidden mb-6 cursor-pointer hover:shadow-xl transition-all active:scale-[0.98]"
        >
          <div className="aspect-video relative">
            {meditations[0].coverUrl ? (
              <img
                src={meditations[0].coverUrl}
                alt={meditations[0].title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <Play className="w-8 h-8 text-emerald-600 ml-1" />
              </div>
            </div>

            {/* Info */}
            <div className="absolute bottom-4 left-4 right-4">
              <h2 className="text-xl font-bold text-white mb-1">
                {meditations[0].title}
              </h2>
              <div className="flex items-center gap-3 text-white/80 text-sm">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {meditations[0].duration} мин
                </span>
                <span className="flex items-center gap-1">
                  <Headphones className="w-4 h-4" />
                  Медитация
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meditations Grid */}
      <h2 className="text-lg font-bold text-gray-900 mb-3">Все медитации</h2>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card rounded-2xl aspect-square animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {meditations.slice(1).map((meditation) => (
            <MeditationCard
              key={meditation.id}
              meditation={meditation}
              onPlay={() => playMeditation(meditation)}
              isCurrentlyPlaying={selectedMeditation?.id === meditation.id && isPlaying}
            />
          ))}
        </div>
      )}

      {/* Full Screen Player */}
      {showPlayer && selectedMeditation && (
        <div className="fixed inset-x-0 top-0 bottom-24 z-50 bg-gradient-to-b from-[#1a1a2e] to-[#16213e] flex flex-col">
          {/* Close button */}
          <button
            onClick={closePlayer}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center z-10"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Cover Art */}
          <div className="flex-1 flex items-center justify-center p-8 pb-4">
            <div className="relative">
              {/* Animated rings */}
              <div
                className={`absolute inset-0 rounded-full ${
                  isPlaying ? 'animate-pulse-ring' : ''
                }`}
              >
                <div className="absolute inset-[-20px] rounded-full border-2 border-emerald-500/20" />
                <div className="absolute inset-[-40px] rounded-full border-2 border-emerald-500/10" />
                <div className="absolute inset-[-60px] rounded-full border-2 border-emerald-500/5" />
              </div>

              {/* Cover image */}
              <div className="w-64 h-64 rounded-full overflow-hidden shadow-2xl">
                {selectedMeditation.coverUrl ? (
                  <img
                    src={selectedMeditation.coverUrl}
                    alt={selectedMeditation.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                    <Headphones className="w-24 h-24 text-white/80" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info & Controls */}
          <div className="p-6 pb-6">
            {/* Title */}
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-white mb-1">
                {selectedMeditation.title}
              </h2>
              {selectedMeditation.description && (
                <p className="text-white/60 text-xs line-clamp-1">
                  {selectedMeditation.description}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-emerald-400"
                style={{
                  background: `linear-gradient(to right, #34d399 0%, #34d399 ${
                    (currentTime / (duration || 1)) * 100
                  }%, rgba(255,255,255,0.2) ${
                    (currentTime / (duration || 1)) * 100
                  }%, rgba(255,255,255,0.2) 100%)`,
                }}
              />
              <div className="flex justify-between text-white/60 text-sm mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleMute}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>

              <button
                onClick={() => skip(-15)}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipBack className="w-5 h-5 text-white" />
              </button>

              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-white" />
                ) : (
                  <Play className="w-8 h-8 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={() => skip(15)}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              <button className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
                <Heart className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini Player */}
      {selectedMeditation && !showPlayer && isPlaying && (
        <div
          onClick={() => setShowPlayer(true)}
          className="fixed bottom-28 left-4 right-4 card rounded-2xl p-3 flex items-center gap-3 shadow-xl cursor-pointer z-40"
        >
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
            {selectedMeditation.coverUrl ? (
              <img
                src={selectedMeditation.coverUrl}
                alt={selectedMeditation.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <Headphones className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 truncate">
              {selectedMeditation.title}
            </h4>
            <p className="text-sm text-gray-500">
              {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface MeditationCardProps {
  meditation: Meditation;
  onPlay: () => void;
  isCurrentlyPlaying: boolean;
}

function MeditationCard({ meditation, onPlay, isCurrentlyPlaying }: MeditationCardProps) {
  return (
    <div
      onClick={onPlay}
      className="card rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]"
    >
      <div className="aspect-square relative">
        {meditation.coverUrl ? (
          <img
            src={meditation.coverUrl}
            alt={meditation.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
            <Headphones className="w-12 h-12 text-white/80" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Play indicator */}
        <div className="absolute top-2 right-2">
          {isCurrentlyPlaying ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
              <div className="flex gap-0.5">
                <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
                <span className="w-0.5 h-4 bg-white rounded-full animate-pulse animation-delay-100" />
                <span className="w-0.5 h-2 bg-white rounded-full animate-pulse animation-delay-200" />
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-4 h-4 text-emerald-600 ml-0.5" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="absolute bottom-2 left-2 right-2">
          <h3 className="font-semibold text-white text-sm truncate">
            {meditation.title}
          </h3>
          <span className="text-white/70 text-xs">{meditation.duration} мин</span>
        </div>
      </div>
    </div>
  );
}
