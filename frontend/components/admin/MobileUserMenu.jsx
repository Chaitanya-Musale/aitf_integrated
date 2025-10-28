'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MoreVertical, Edit, UserCheck, UserX, Trash2 } from 'lucide-react';

export default function MobileUserMenu({ 
  user, 
  currentUserId,
  onEdit, 
  onStatusChange, 
  onDelete 
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = (action) => {
    setIsOpen(false);
    action();
  };

  if (user.id === currentUserId) {
    return null; // Don't show menu for current user
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2"
      >
        <MoreVertical className="w-4 h-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border z-20 animate-in slide-in-from-top-2 duration-200">
            <div className="py-1">
              <button
                onClick={() => handleAction(() => onEdit(user))}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Edit className="w-4 h-4 mr-3" />
                Edit User
              </button>
              
              <button
                onClick={() => handleAction(() => onStatusChange(user.id, user.status === 'active' ? 'inactive' : 'active'))}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {user.status === 'active' ? (
                  <>
                    <UserX className="w-4 h-4 mr-3" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4 mr-3" />
                    Activate
                  </>
                )}
              </button>
              
              <button
                onClick={() => handleAction(() => onDelete(user.id))}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-3" />
                Delete User
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}