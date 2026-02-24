'use client';

import { useState, useEffect } from 'react';
import TaskCard from '@/components/TaskCard';
import { getTasks, completeTask } from '@/lib/store';
import { Task } from '@/lib/types';

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');

  useEffect(() => {
    setTasks(getTasks());
  }, []);

  const buyerTasks = tasks.filter(t => t.buyerId === 'demo-user');
  const sellerTasks = tasks.filter(t => t.sellerId === 'demo-seller');

  const handleComplete = (taskId: string) => {
    completeTask(taskId);
    setTasks(getTasks());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setActiveTab('buyer')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'buyer'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          My Tasks (as Buyer)
        </button>
        <button
          onClick={() => setActiveTab('seller')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'seller'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          My Jobs (as Seller)
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-900">
            {activeTab === 'buyer' ? buyerTasks.length : sellerTasks.length}
          </div>
          <div className="text-gray-600">Total</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">
            {activeTab === 'buyer' 
              ? buyerTasks.filter(t => t.status === 'open').length
              : sellerTasks.filter(t => t.status === 'open').length
            }
          </div>
          <div className="text-gray-600">Open</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-yellow-600">
            {activeTab === 'buyer'
              ? buyerTasks.filter(t => t.status === 'in_progress').length
              : sellerTasks.filter(t => t.status === 'in_progress').length
            }
          </div>
          <div className="text-gray-600">In Progress</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">
            ${(activeTab === 'buyer'
              ? buyerTasks.filter(t => t.status === 'completed')
              : sellerTasks.filter(t => t.status === 'completed')
            ).reduce((sum, t) => sum + t.price, 0)}
          </div>
          <div className="text-gray-600">Completed Value</div>
        </div>
      </div>

      {/* Tasks List */}
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        {activeTab === 'buyer' ? 'Tasks You Posted' : 'Tasks You Claimed'}
      </h2>
      
      {activeTab === 'buyer' ? (
        buyerTasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {buyerTasks.map(task => (
              <div key={task.id} className="relative">
                <TaskCard task={task} />
                {task.status === 'in_progress' && (
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="absolute bottom-4 right-4 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Mark Complete
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500">You haven't posted any tasks yet.</p>
          </div>
        )
      ) : (
        sellerTasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sellerTasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500">You haven't claimed any tasks yet.</p>
          </div>
        )
      )}
    </div>
  );
}
