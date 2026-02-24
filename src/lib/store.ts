// Simple localStorage-based store for MVP
import { Task, User, Review } from './types';

const STORAGE_KEYS = {
  TASKS: 'botmarket_tasks',
  USERS: 'botmarket_users',
  REVIEWS: 'botmarket_reviews',
  CURRENT_USER: 'botmarket_current_user',
};

// Generate unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Initialize with sample data if empty
export function initializeStore(): void {
  if (typeof window === 'undefined') return;
  
  if (!localStorage.getItem(STORAGE_KEYS.TASKS)) {
    const sampleTasks: Task[] = [
      {
        id: generateId(),
        title: 'Write product descriptions for 10 items',
        description: 'Need engaging product descriptions for our ecommerce store. Each description should be 100-150 words.',
        price: 50,
        category: 'content_writing',
        status: 'open',
        buyerId: 'user1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        title: 'Build a Twitter bot that posts quotes',
        description: 'Create a Python bot that fetches quotes from an API and posts them to Twitter automatically.',
        price: 150,
        category: 'bot_automation',
        status: 'open',
        buyerId: 'user2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        title: 'Research competitor pricing strategy',
        description: 'Analyze top 5 competitors pricing and create a detailed report with recommendations.',
        price: 75,
        category: 'research',
        status: 'open',
        buyerId: 'user3',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        title: 'Design logo for AI startup',
        description: 'Create a modern, tech-focused logo for an AI automation company. Need source files.',
        price: 200,
        category: 'design',
        status: 'in_progress',
        buyerId: 'user1',
        sellerId: 'bot1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(sampleTasks));
  }

  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    const sampleUsers: User[] = [
      { id: 'user1', name: 'John Buyer', email: 'john@example.com', role: 'buyer', rating: 4.5, reviewCount: 12, createdAt: new Date().toISOString() },
      { id: 'user2', name: 'Sarah Smith', email: 'sarah@example.com', role: 'both', rating: 4.8, reviewCount: 25, createdAt: new Date().toISOString() },
      { id: 'bot1', name: 'ContentBot Pro', email: 'bot@example.com', role: 'seller', rating: 4.9, reviewCount: 89, createdAt: new Date().toISOString() },
      { id: 'bot2', name: 'DataScraper AI', email: 'ai@example.com', role: 'seller', rating: 4.7, reviewCount: 45, createdAt: new Date().toISOString() },
    ];
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(sampleUsers));
  }
}

// Task operations
export function getTasks(): Task[] {
  if (typeof window === 'undefined') return [];
  initializeStore();
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS) || '[]');
}

export function getTaskById(id: string): Task | undefined {
  return getTasks().find(t => t.id === id);
}

export function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
  const tasks = getTasks();
  const newTask: Task = {
    ...task,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  return newTask;
}

export function updateTask(id: string, updates: Partial<Task>): Task | undefined {
  const tasks = getTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return undefined;
  
  tasks[index] = { ...tasks[index], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  return tasks[index];
}

export function claimTask(taskId: string, sellerId: string): Task | undefined {
  return updateTask(taskId, { status: 'in_progress', sellerId });
}

export function completeTask(taskId: string): Task | undefined {
  return updateTask(taskId, { 
    status: 'completed', 
    completedAt: new Date().toISOString() 
  });
}

// User operations
export function getUsers(): User[] {
  if (typeof window === 'undefined') return [];
  initializeStore();
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
}

export function getUserById(id: string): User | undefined {
  return getUsers().find(u => u.id === id);
}

// Review operations
export function getReviews(): Review[] {
  if (typeof window === 'undefined') return [];
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.REVIEWS) || '[]');
}

export function getReviewsForUser(userId: string): Review[] {
  return getReviews().filter(r => r.revieweeId === userId);
}

export function createReview(review: Omit<Review, 'id' | 'createdAt'>): Review {
  const reviews = getReviews();
  const newReview: Review = {
    ...review,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  reviews.push(newReview);
  localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews));
  return newReview;
}
