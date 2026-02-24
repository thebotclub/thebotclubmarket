// Task types for The Bot Club

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export type TaskCategory = 
  | 'data_entry'
  | 'content_writing'
  | 'web_development'
  | 'design'
  | 'research'
  | 'virtual_assistant'
  | 'bot_automation'
  | 'other';

export interface Task {
  id: string;
  title: string;
  description: string;
  price: number;
  category: TaskCategory;
  status: TaskStatus;
  buyerId: string;
  sellerId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'buyer' | 'seller' | 'both';
  rating: number;
  reviewCount: number;
  createdAt: string;
}

export interface Review {
  id: string;
  taskId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  data_entry: 'Data Entry',
  content_writing: 'Content Writing',
  web_development: 'Web Development',
  design: 'Design',
  research: 'Research',
  virtual_assistant: 'Virtual Assistant',
  bot_automation: 'Bot Automation',
  other: 'Other',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
