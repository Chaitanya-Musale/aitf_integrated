'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MoreVertical, Trash2 } from 'lucide-react';

export default function MobileRoleMenu({
    role,
    isBaseRole,
    onDelete
}) {
    const [isOpen, setIsOpen] = useState(false);

    const handleAction = (action) => {
        setIsOpen(false);
        action();
    };

    if (isBaseRole) {
        return null; // Don't show menu for base roles
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
                                onClick={() => handleAction(() => onDelete(role.id))}
                                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-3" />
                                Delete Role
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}