'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Edit, Archive, Trash2, MoreVertical, UserPlus } from 'lucide-react';

export default function MobileJobMenu({ job, onAddExistingCandidates, onEdit, onArchive, onDelete }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="p-2"
        onClick={() => setIsOpen(!isOpen)}
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
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20 animate-in slide-in-from-top-2 duration-200">
            <div className="py-1">
              <button
                onClick={() => {
                  console.log('Mobile button clicked, job:', job, 'handler:', onAddExistingCandidates);
                  onAddExistingCandidates && onAddExistingCandidates(job);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <UserPlus className="w-4 h-4 mr-3" />
                Add Candidates
              </button>
              <button
                onClick={() => {
                  onEdit(job);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Edit className="w-4 h-4 mr-3" />
                Edit Job
              </button>
              <button
                onClick={() => {
                  onArchive(job.id, job.status);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Archive className="w-4 h-4 mr-3" />
                {job.status === 'active' ? 'Archive' : 'Activate'}
              </button>
              <button
                onClick={() => {
                  onDelete(job.id);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-3" />
                Delete Job
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}