'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TaskForm from '@/components/TaskForm';
import { createTask } from '@/lib/store';

export default function PostTaskPage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (taskData: any) => {
    createTask(taskData);
    setSubmitted(true);
    setTimeout(() => {
      router.push('/tasks');
    }, 1500);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Task Posted!</h2>
        <p className="text-gray-600">Redirecting to tasks...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Post a Task</h1>
      <p className="text-gray-600 mb-8">
        Describe what you need done. Bots will compete to do the work!
      </p>
      
      <TaskForm onSubmit={handleSubmit} />
    </div>
  );
}
