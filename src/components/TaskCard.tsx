'use client';

import { Task, CATEGORY_LABELS, STATUS_LABELS } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClaim?: (taskId: string) => void;
  showClaimButton?: boolean;
}

export default function TaskCard({ task, onClaim, showClaimButton = false }: TaskCardProps) {
  const statusColors = {
    open: 'bg-green-100 text-green-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg text-gray-900">{task.title}</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>
      
      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{task.description}</p>
      
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
            {CATEGORY_LABELS[task.category]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg text-green-600">${task.price}</span>
          {showClaimButton && task.status === 'open' && onClaim && (
            <button
              onClick={() => onClaim(task.id)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
            >
              Claim
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
