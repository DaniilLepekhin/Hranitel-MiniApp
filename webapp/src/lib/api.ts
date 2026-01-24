const API_URL = process.env.NEXT_PUBLIC_API_URL !== undefined
  ? process.env.NEXT_PUBLIC_API_URL
  : 'http://localhost:3001';

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
  retry?: number; // Number of retries (default: 2)
  retryDelay?: number; // Delay between retries in ms (default: 1000)
}

// Token management - synchronized with auth store
let authToken: string | null = null;
let tokenSetPromise: Promise<void> | null = null;
let resolveTokenSet: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  // Resolve any pending token wait
  if (resolveTokenSet) {
    resolveTokenSet();
    resolveTokenSet = null;
    tokenSetPromise = null;
  }
};

export const getAuthToken = () => authToken;

// Wait for token to be set (used internally)
const waitForToken = (): Promise<void> => {
  if (authToken) return Promise.resolve();
  if (!tokenSetPromise) {
    tokenSetPromise = new Promise((resolve) => {
      resolveTokenSet = resolve;
    });
  }
  return tokenSetPromise;
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: ApiOptions = {}, skipV1Prefix = false): Promise<T> {
    const { params, retry = 2, retryDelay = 1000, ...init } = options;

    let url = skipV1Prefix
      ? `${this.baseUrl}${endpoint}`
      : `${this.baseUrl}/api/v1${endpoint}`;

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

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          const error: any = new Error(errorData.message || errorData.error || 'Request failed');
          error.status = response.status;
          error.response = { data: errorData };

          // Don't retry on 4xx client errors (except 429 rate limit)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            console.error(`API Error [${response.status}] ${endpoint}:`, errorData);
            throw error;
          }

          lastError = error;
        } else {
          return response.json();
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Network errors should be retried
        if (attempt < retry) {
          console.warn(`API request failed (attempt ${attempt + 1}/${retry + 1}), retrying in ${retryDelay}ms...`, endpoint);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1))); // Exponential backoff
        }
      }
    }

    console.error(`API Error [failed after ${retry + 1} attempts] ${endpoint}:`, lastError);
    throw lastError || new Error('Request failed');
  }

  get<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  // GET без префикса /api/v1
  getRaw<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' }, true);
  }

  post<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // POST без префикса /api/v1
  postRaw<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }, true);
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

// Users
export const usersApi = {
  updateProfile: (data: { firstName?: string; lastName?: string; city?: string }) =>
    api.patch<{ success: boolean; user: Partial<User> }>('/users/me', data),
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

// Energies (КОД ДЕНЕГ 4.0)
export const energiesApi = {
  getBalance: (userId: string) =>
    api.getRaw<{ success: boolean; balance: number }>(`/api/energies/balance`, { params: { userId } }),
  getHistory: (userId: string, limit?: number) =>
    api.getRaw<{ success: boolean; transactions: EnergyTransaction[] }>(`/api/energies/history`, {
      params: { userId, limit }
    }),
  getStats: (userId: string) =>
    api.getRaw<{ success: boolean; stats: EnergyStats }>(`/api/energies/stats`, { params: { userId } }),
};

// Shop (КОД ДЕНЕГ 4.0)
export const shopApi = {
  listItems: (category?: 'elite' | 'secret' | 'savings') =>
    api.get<{ success: boolean; items: ShopItem[] }>('/shop/items', { params: { category } }),
  getItemsByCategory: (category: 'elite' | 'secret' | 'savings') =>
    api.get<{ success: boolean; items: ShopItem[] }>(`/shop/items/by-category`, {
      params: { category }
    }),
  getItem: (itemId: string) =>
    api.get<{ success: boolean; item: ShopItem }>(`/shop/items/${itemId}`),
  purchaseItem: (userId: string, itemId: string) =>
    api.post<{ success: boolean; purchase: ShopPurchase; newBalance: number }>(
      '/shop/purchase',
      { userId, itemId }
    ),
  getPurchases: (userId: string) =>
    api.get<{ success: boolean; purchases: ShopPurchase[] }>('/shop/purchases', {
      params: { userId }
    }),
  getUserBalance: (userId: string) =>
    api.get<{ success: boolean; balance: number }>('/shop/balance', { params: { userId } }),
};

// Teams (Десятки) (КОД ДЕНЕГ 4.0)
export const teamsApi = {
  getUserTeam: (userId: string) =>
    api.get<{ success: boolean; team: Team | null }>('/teams/my', { params: { userId } }),
  getTeam: (teamId: string) =>
    api.get<{ success: boolean; team: Team }>(`/teams/${teamId}`),
  getTeamMembers: (teamId: string) =>
    api.get<{ success: boolean; members: TeamMember[] }>(`/teams/${teamId}/members`),
  listTeams: (metka?: string, page?: number, limit?: number) =>
    api.get<{ success: boolean; teams: Team[]; total: number; page: number; totalPages: number }>(
      '/teams',
      { params: { metka, page, limit } }
    ),
  distributeUsers: () =>
    api.post<{ success: boolean; teamsCreated: number; usersDistributed: number }>(
      '/teams/distribute'
    ),
};

// Streams (Прямые эфиры) (КОД ДЕНЕГ 4.0)
export const streamsApi = {
  listStreams: (upcoming?: boolean, page?: number, limit?: number) =>
    api.get<{ success: boolean; streams: Stream[]; total: number }>('/streams', {
      params: { upcoming: upcoming?.toString(), page, limit },
    }),
  getStream: (streamId: string) =>
    api.get<{ success: boolean; stream: Stream }>(`/streams/${streamId}`),
  getNextStream: () =>
    api.get<{ success: boolean; stream: Stream | null }>('/streams/next'),
  markAttendance: (userId: string, streamId: string, watchedOnline: boolean) =>
    api.post<{ success: boolean; attendance: StreamAttendance; energiesEarned: number }>(
      '/streams/attendance',
      { userId, streamId, watchedOnline }
    ),
  getUserAttendance: (userId: string, streamId: string) =>
    api.get<{ success: boolean; attendance: StreamAttendance | null }>('/streams/attendance', {
      params: { userId, streamId },
    }),
  getStreamAttendance: (streamId: string) =>
    api.get<{ success: boolean; attendance: StreamAttendance[]; stats: AttendanceStats }>(
      `/streams/${streamId}/attendance`
    ),
};

// Content (Путь - Обучающий контент)
export const contentApi = {
  // Get content items list
  getItems: (params?: { type?: string; keyNumber?: number; monthProgram?: boolean }) =>
    api.get<{ items: ContentItem[] }>('/content/items', { params: params as any }),

  // Get single content item
  getItem: (itemId: string) =>
    api.get<{ item: ContentItem }>(`/content/items/${itemId}`),

  // Get monthly program
  getMonthProgram: () =>
    api.get<{ items: ContentItem[] }>('/content/month-program'),

  // Get content sections (lessons/episodes)
  getSections: (itemId: string) =>
    api.get<{ sections: ContentSection[] }>(`/content/${itemId}/sections`),

  // Get videos in a section
  getSectionVideos: (sectionId: string) =>
    api.get<{ videos: Video[] }>(`/content/sections/${sectionId}/videos`),

  // Get video details with timecodes
  getVideo: (videoId: string) =>
    api.get<{ video: Video; timecodes: VideoTimecode[] }>(`/content/videos/${videoId}`),

  // Get videos directly attached to content item (stream recordings)
  getItemVideos: (itemId: string) =>
    api.get<{ videos: Video[] }>(`/content/${itemId}/videos`),

  // Get user progress
  getUserProgress: (userId: string) =>
    api.get<{ progress: UserContentProgress[] }>('/content/progress', { params: { userId } }),

  // Get user progress stats
  getUserProgressStats: (userId: string) =>
    api.get<{ stats: { totalWatched: number; totalEnergies: number; totalWatchTime: number } }>(
      '/content/progress/stats',
      { params: { userId } }
    ),

  // Mark video as completed
  completeVideo: (userId: string, videoId: string, watchTimeSeconds?: number) =>
    api.post<{ progress: UserContentProgress; energiesEarned: number }>(
      '/content/progress/complete',
      { userId, videoId, watchTimeSeconds }
    ),

  // Get practice content
  getPracticeContent: (practiceId: string) =>
    api.get<{ practice: PracticeContent }>(`/content/practices/${practiceId}/content`),
};

// Reports (Недельные отчеты) (КОД ДЕНЕГ 4.0)
export const reportsApi = {
  getDeadline: () =>
    api.get<{ success: boolean; deadline: Date; weekNumber: number; hoursRemaining: number }>(
      '/reports/deadline'
    ),
  submitReport: (userId: string, content: string) =>
    api.post<{ success: boolean; report: WeeklyReport; energiesEarned: number }>(
      '/reports/submit',
      { userId, content }
    ),
  getUserReports: (userId: string, limit?: number) =>
    api.get<{ success: boolean; reports: WeeklyReport[] }>('/reports/user', {
      params: { userId, limit },
    }),
  getReport: (reportId: string) =>
    api.get<{ success: boolean; report: WeeklyReport }>(`/reports/${reportId}`),
  getWeekReport: (userId: string, weekNumber: number) =>
    api.get<{ success: boolean; report: WeeklyReport | null }>('/reports/week', {
      params: { userId, weekNumber },
    }),
  getStats: (userId: string) =>
    api.get<{ success: boolean; stats: ReportStats }>('/reports/stats', {
      params: { userId },
    }),
};

// City Chats (Городские чаты) (КОД ДЕНЕГ 4.0)
export const cityChatsApi = {
  getCountries: () =>
    api.get<{ success: boolean; countries: string[] }>('/city-chats/countries'),
  getCities: (country: string) =>
    api.get<{ success: boolean; cities: CityInfo[] }>('/city-chats/cities', {
      params: { country },
    }),
  getChatLink: (city: string) =>
    api.get<{ success: boolean; chatLink: string; chatName: string; country: string; cityChatId: number; telegramChatId: number | null }>(
      '/city-chats/link',
      { params: { city } }
    ),
  joinChat: (telegramId: number, cityChatId: number) =>
    api.post<{ success: boolean; message: string }>(
      '/city-chats/join',
      { telegramId, cityChatId }
    ),
};

// Ratings (Рейтинги) (КОД ДЕНЕГ 4.0)
export const ratingsApi = {
  getCityRatings: (limit?: number) =>
    api.get<{ success: boolean; ratings: CityRating[] }>('/ratings/cities', {
      params: { limit },
    }),
  getTeamRatings: (limit?: number) =>
    api.get<{ success: boolean; ratings: TeamRating[] }>('/ratings/teams', {
      params: { limit },
    }),
  getUserPosition: (userId: string) =>
    api.get<{ success: boolean; position: UserPosition }>('/ratings/user-position', {
      params: { userId },
    }),
};

// Types
export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  city?: string;
  email?: string;
  phone?: string;
  level: number;
  experience: number;
  energies: number; // Energy Points (основная валюта)
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

// КОД ДЕНЕГ 4.0 Types

export interface EnergyTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'income' | 'expense';
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EnergyStats {
  totalEarned: number;
  totalSpent: number;
  currentBalance: number;
  transactionCount: number;
  topEarningReasons: { reason: string; total: number }[];
}

export interface ShopItem {
  id: string;
  title: string;
  description?: string;
  price: number;
  category: 'elite' | 'secret' | 'savings';
  itemType: 'raffle_ticket' | 'lesson' | 'discount' | 'gift' | 'access';
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  stock?: number;
  createdAt: string;
}

export interface ShopPurchase {
  id: string;
  userId: string;
  itemId: string;
  price: number;
  status: 'pending' | 'completed' | 'cancelled';
  metadata?: Record<string, unknown>;
  createdAt: string;
  item?: ShopItem;
}

export interface Team {
  id: string;
  name: string;
  metka?: string;
  cityChat?: string;
  maxMembers: number;
  memberCount: number;
  createdAt: string;
  userRole?: 'leader' | 'member';
  joinedAt?: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: 'leader' | 'member';
  joinedAt: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    photoUrl?: string;
  };
}

export interface Stream {
  id: string;
  title: string;
  description?: string;
  scheduledAt: string;
  duration: number;
  streamUrl?: string;
  recordingUrl?: string;
  epReward: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StreamAttendance {
  id: string;
  streamId: string;
  userId: string;
  watchedOnline: boolean;
  energiesEarned: number;
  createdAt: string;
}

export interface AttendanceStats {
  totalAttendees: number;
  onlineAttendees: number;
  recordingAttendees: number;
  totalEnergiesAwarded: number;
}

export interface WeeklyReport {
  id: string;
  userId: string;
  weekNumber: number;
  content: string;
  deadline: string;
  energiesEarned: number;
  submittedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ReportStats {
  totalReports: number;
  currentStreak: number;
  longestStreak: number;
  totalEnergiesEarned: number;
  averageWordCount: number;
}

export interface CityInfo {
  name: string;
  chatName: string;
}

export interface CityRating {
  city: string;
  totalEnergies: number;
  userCount: number;
  rank: number;
}

export interface TeamRating {
  teamId: string;
  teamName: string;
  totalEnergies: number;
  memberCount: number;
  rank: number;
}

export interface UserPosition {
  globalRank: number;
  cityRank: number | null;
  teamRank: number | null;
  city: string | null;
  teamId: string | null;
}

// Content System Types (Путь - Обучающий контент)
export interface ContentItem {
  id: string;
  type: 'course' | 'podcast' | 'stream_record' | 'practice';
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  thumbnailUrl?: string | null; // Миниатюра для списков
  keyNumber?: number | null; // 1-12 для связи с ключами
  monthProgram: boolean; // Программа месяца
  orderIndex: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentSection {
  id: string;
  contentItemId: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  createdAt: string;
}

export interface Video {
  id: string;
  contentSectionId?: string | null;
  contentItemId?: string | null;
  title: string;
  description?: string | null;
  videoUrl: string; // YouTube, Vimeo, S3, etc.
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  orderIndex: number;
  createdAt: string;
}

export interface VideoTimecode {
  id: string;
  videoId: string;
  timeSeconds: number;
  title: string;
  description?: string | null;
  orderIndex: number;
}

export interface UserContentProgress {
  id: string;
  userId: string;
  contentItemId?: string | null;
  videoId?: string | null;
  watched: boolean;
  watchTimeSeconds: number;
  completedAt?: string | null;
  energiesEarned: number;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeContent {
  id: string;
  contentItemId: string;
  contentType: 'markdown' | 'html';
  content: string;
  createdAt: string;
}
