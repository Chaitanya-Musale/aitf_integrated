'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authService } from '@/lib/auth';
import { Clock, LogOut } from 'lucide-react';

export default function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const checkSession = () => {
      if (!authService.isAuthenticated()) {
        setShowWarning(false);
        return;
      }

      const remaining = authService.getSessionTimeRemaining();
      setTimeRemaining(remaining);

      // Show warning when 15 minutes or less remaining
      if (remaining <= 15 && remaining > 0) {
        setShowWarning(true);
      } else if (remaining <= 0) {
        // Session expired
        authService.logout();
        router.push('/');
      } else {
        setShowWarning(false);
      }
    };

    // Check immediately
    checkSession();

    // Check every 30 seconds
    const interval = setInterval(checkSession, 30000);

    return () => clearInterval(interval);
  }, [router]);

  const handleLogout = () => {
    authService.logout();
    router.push('/');
  };

  const handleDismiss = () => {
    setShowWarning(false);
  };

  if (!showWarning) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center text-orange-800">
            <Clock className="w-4 h-4 mr-2" />
            Session Expiring Soon
          </CardTitle>
          <CardDescription className="text-orange-700">
            Your session will expire in {timeRemaining} minute{timeRemaining !== 1 ? 's' : ''}. 
            You'll be automatically logged out.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex space-x-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleDismiss}
              className="flex-1"
            >
              Dismiss
            </Button>
            <Button 
              size="sm" 
              onClick={handleLogout}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              <LogOut className="w-3 h-3 mr-1" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}