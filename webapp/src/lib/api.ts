const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

// Token management
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { params, ...init } = options;

    let url = `${this.baseUrl}/api/v1${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    };

    // Add auth token if available
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  get<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  patch<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient(API_URL);

// Auth
export const authApi = {
  login: (initData: string, initDataUnsafe?: unknown) =>
    api.post<{ success: boolean; user: User; token: string }>('/auth/telegram', {
      initData,
      initDataUnsafe,
    }),
  me: () => api.get<{ success: boolean; user: User }>('/auth/me'),
  logout: () => api.post<{ success: boolean }>('/auth/logout'),
};

// Courses
export const coursesApi = {
  list: (category?: string) =>
    api.get<{ success: boolean; courses: Course[] }>('/courses', { params: { category } }),
  get: (id: string) =>
    api.get<{ success: boolean; course: CourseWithDays }>(`/courses/${id}`),
  updateProgress: (id: string, data: { currentDay?: number; completedDay?: number }) =>
    api.post<{ success: boolean }>(`/courses/${id}/progress`, data),
  toggleFavorite: (id: string) =>
    api.post<{ success: boolean; isFavorite: boolean }>(`/courses/${id}/favorite`),
  favorites: () =>
    api.get<{ success: boolean; favorites: Course[] }>('/courses/favorites/list'),
};

// Meditations
export const meditationsApi = {
  list: (category?: string) =>
    api.get<{ success: boolean; meditations: Meditation[] }>('/meditations', { params: { category } }),
  get: (id: string) =>
    api.get<{ success: boolean; meditation: Meditation }>(`/meditations/${id}`),
  logSession: (id: string, data: { durationListened: number; completed?: boolean }) =>
    api.post<{ success: boolean; xpAwarded: number }>(`/meditations/${id}/session`, data),
  history: (limit?: number) =>
    api.get<{ success: boolean; history: MeditationHistory[] }>('/meditations/history/list', {
      params: { limit },
    }),
  stats: () =>
    api.get<{ success: boolean; stats: MeditationStats }>('/meditations/stats/summary'),
};

// Gamification
export const gamificationApi = {
  stats: () =>
    api.get<{ success: boolean; stats: GamificationStats }>('/gamification/stats'),
  xpHistory: (days?: number) =>
    api.get<{ success: boolean; history: XPHistory[]; byDay: Record<string, number>; total: number }>(
      '/gamification/xp-history',
      { params: { days } }
    ),
  achievements: () =>
    api.get<{ success: boolean; achievements: UserAchievements }>('/gamification/achievements'),
  leaderboard: (limit?: number) =>
    api.get<{ success: boolean; leaderboard: LeaderboardEntry[] }>('/gamification/leaderboard', {
      params: { limit },
    }),
};

// AI Chat
export const aiApi = {
  chat: (message: string) =>
    api.post<{ success: boolean; message: string }>('/ai/chat', { message }),
  history: (limit?: number) =>
    api.get<{ success: boolean; messages: ChatMessage[] }>('/ai/chat/history', {
      params: { limit },
    }),
  clearHistory: () => api.delete<{ success: boolean }>('/ai/chat/history'),
  transcribe: (audio: string) =>
    api.post<{ success: boolean; text: string }>('/ai/transcribe', { audio }),
};

// Types
export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  level: number;
  experience: number;
  streak: number;
  isPro: boolean;
  subscriptionExpires?: string;
  createdAt: string;
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  category: string;
  coverUrl?: string;
  isPremium: boolean;
  isLocked?: boolean;
  isFavorite?: boolean;
  progress?: {
    currentDay: number;
    completedDays: number[];
    lastAccessedAt: string;
  };
}

export interface CourseDay {
  id: string;
  courseId: string;
  dayNumber: number;
  title: string;
  content?: string;
  audioUrl?: string;
  videoUrl?: string;
  pdfUrl?: string;
  welcomeContent?: string;
  courseInfo?: string;
  meditationGuide?: string;
  additionalContent?: string;
  giftContent?: string;
  streamLink?: string;
  isPremium: boolean;
  isLocked?: boolean;
}

export interface CourseWithDays extends Course {
  days: CourseDay[];
}

export interface Meditation {
  id: string;
  title: string;
  description?: string;
  duration: number;
  coverUrl?: string;
  audioUrl?: string;
  audioSeries?: { title: string; url: string }[];
  category?: string;
  isPremium: boolean;
  isLocked?: boolean;
}

export interface MeditationHistory {
  id: string;
  durationListened: number;
  completed: boolean;
  createdAt: string;
  meditation: {
    id: string;
    title: string;
    duration: number;
    coverUrl?: string;
  };
}

export interface MeditationStats {
  totalSessions: number;
  completedSessions: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number;
}

export interface GamificationStats {
  level: number;
  experience: number;
  streak: number;
  lastActiveDate?: string;
  currentLevelXP: number;
  nextLevelXP: number;
  progressToNextLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
}

export interface XPHistory {
  id: string;
  amount: number;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description?: string;
  icon?: string;
  xpReward: number;
  unlockedAt?: string;
}

export interface UserAchievements {
  unlocked: Achievement[];
  locked: Achievement[];
  total: number;
  unlockedCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  level: number;
  experience: number;
  streak: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
