'use client';

export default function Notification({ notification, onClose }) {
  if (!notification) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
      <div className={`px-4 py-3 rounded-md shadow-lg border ${
        notification.type === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-green-50 border-green-200 text-green-700'
      }`}>
        <div className="flex items-center justify-between">
          <span>{notification.message}</span>
          <button onClick={onClose} className="ml-4 text-lg leading-none">×</button>
        </div>
      </div>
    </div>
  );
}