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
  ChevronDown,
} from 'lucide-react';
import { meditationsApi } from '@/lib/api';
import type { Meditation } from '@/lib/api';

// Local storage key for favorite meditations
const FAVORITES_KEY = 'meditation_favorites';

function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(FAVORITES_KEY);
  return stored ? JSON.parse(stored) : [];
}

function toggleFavorite(id: string): boolean {
  const favorites = getFavorites();
  const index = favorites.indexOf(id);
  if (index > -1) {
    favorites.splice(index, 1);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return false;
  } else {
    favorites.push(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return true;
  }
}

export function MeditationsTab() {
  const [selectedMeditation, setSelectedMeditation] = useState<Meditation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const queryClient = useQueryClient();

  // Load favorites on mount
  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

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

  // Toggle favorite for current meditation
  const handleToggleFavorite = () => {
    if (!selectedMeditation) return;
    const isFav = toggleFavorite(selectedMeditation.id);
    setFavorites(getFavorites());
  };

  const isFavorite = selectedMeditation ? favorites.includes(selectedMeditation.id) : false;

  // Minimize player - audio continues playing
  const minimizePlayer = () => {
    setShowPlayer(false);
    // Audio continues playing in background
  };

  // Close player completely - stops audio
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
    setCurrentTime(0);
    setDuration(0);
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
        <h1 className="text-2xl font-bold text-white mb-1">Медитации</h1>
        <p className="text-gray-300">Найдите свой момент покоя</p>
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
      <h2 className="text-lg font-bold text-white mb-3">Все медитации</h2>

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
              isFavorite={favorites.includes(meditation.id)}
            />
          ))}
        </div>
      )}

      {/* Full Screen Player */}
      {showPlayer && selectedMeditation && (
        <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#1a1a2e] to-[#16213e] flex flex-col">
          {/* Background image */}
          <div className="absolute inset-0">
            {selectedMeditation.coverUrl && (
              <img
                src={selectedMeditation.coverUrl}
                alt=""
                className="w-full h-full object-cover opacity-20 blur-2xl"
              />
            )}
          </div>

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between p-4">
            <button
              onClick={minimizePlayer}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center"
            >
              <ChevronDown className="w-6 h-6 text-white" />
            </button>
            <span className="text-white/60 text-sm">Сейчас играет</span>
            <button
              onClick={closePlayer}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Cover Art */}
          <div className="relative z-10 flex-1 flex items-center justify-center px-8">
            <div className="relative">
              {/* Animated rings */}
              <div className={`absolute inset-0 rounded-full ${isPlaying ? 'animate-pulse' : ''}`}>
                <div className="absolute inset-[-15px] rounded-full border-2 border-emerald-500/20" />
                <div className="absolute inset-[-30px] rounded-full border-2 border-emerald-500/10" />
                <div className="absolute inset-[-45px] rounded-full border-2 border-emerald-500/5" />
              </div>

              {/* Cover image */}
              <div className="w-48 h-48 rounded-full overflow-hidden shadow-2xl">
                {selectedMeditation.coverUrl ? (
                  <img
                    src={selectedMeditation.coverUrl}
                    alt={selectedMeditation.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                    <Headphones className="w-16 h-16 text-white/80" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info & Controls - increased bottom padding */}
          <div className="relative z-10 px-6 pb-32">
            {/* Title */}
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-white mb-1">
                {selectedMeditation.title}
              </h2>
              {selectedMeditation.description && (
                <p className="text-white/60 text-sm line-clamp-1">
                  {selectedMeditation.description}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer
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
              <div className="flex justify-between text-white/60 text-sm mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleMute}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
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
                  <Play className="w-8 h-8 text-white ml-1" />
                )}
              </button>

              <button
                onClick={() => skip(15)}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              <button
                onClick={handleToggleFavorite}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              >
                <Heart
                  className={`w-5 h-5 ${isFavorite ? 'text-red-500 fill-red-500' : 'text-white'}`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini Player - shows when player is minimized but audio is playing or paused */}
      {selectedMeditation && !showPlayer && (
        <div className="fixed bottom-28 left-4 right-4 z-50">
          <div
            className="bg-[#1a1a2e] backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/10"
            onClick={() => setShowPlayer(true)}
          >
            <div className="flex items-center gap-3">
              {/* Cover */}
              <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
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

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-white truncate text-sm">
                  {selectedMeditation.title}
                </h4>
                <p className="text-xs text-white/60">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              </div>

              {/* Controls - only play/pause and close */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-white" />
                  ) : (
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  )}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closePlayer();
                  }}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>

            {/* Mini progress bar */}
            <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MeditationCardProps {
  meditation: Meditation;
  onPlay: () => void;
  isCurrentlyPlaying: boolean;
  isFavorite: boolean;
}

function MeditationCard({ meditation, onPlay, isCurrentlyPlaying, isFavorite }: MeditationCardProps) {
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

        {/* Favorite indicator */}
        {isFavorite && (
          <div className="absolute top-2 left-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" />
          </div>
        )}

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
