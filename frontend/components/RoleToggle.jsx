'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Users, Briefcase, Clock } from 'lucide-react';
import { authService } from '@/lib/auth';

export default function RoleToggle({ currentRole, userRoles }) {
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [userDataLoaded, setUserDataLoaded] = useState(false);

  // Wait for user data to be available
  useEffect(() => {
    const checkUserData = () => {
      const user = authService.getUser();
      const isAuth = authService.isAuthenticated();
      
      if (isAuth && user) {
        setUserDataLoaded(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkUserData()) {
      return;
    }

    // If not loaded, check periodically for a short time
    const interval = setInterval(() => {
      if (checkUserData()) {
        clearInterval(interval);
      }
    }, 100);

    // Stop checking after 5 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setUserDataLoaded(true); // Give up waiting and render anyway
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Get current user roles dynamically
  const getCurrentUserRoles = () => {
    // Always try auth service first as it's most reliable
    const currentUser = authService.getUser();
    if (currentUser?.roles && Array.isArray(currentUser.roles)) {
      return currentUser.roles.filter(role => role && role !== null && role.trim() !== '');
    }
    
    // Fallback to prop
    if (Array.isArray(userRoles)) {
      return userRoles.filter(role => role && role !== null && role.trim() !== '');
    }
    
    return [];
  };

  const roles = getCurrentUserRoles();
  const hasHR = roles.includes('HR');
  const hasInterviewer = roles.includes('Interviewer') || roles.includes('Technical Team') || roles.includes('Management');

  // Debug logging with session storage info
  console.log('RoleToggle Debug:', {
    userRolesProp: userRoles,
    authServiceUser: authService.getUser(),
    computedRoles: roles,
    hasHR,
    hasInterviewer,
    shouldBeEnabled: hasHR && hasInterviewer,
    userDataLoaded,
    isDisabled: !userDataLoaded || isToggling || !(hasHR && hasInterviewer) || isSessionExpired,
    sessionStorage: {
      token: typeof window !== 'undefined' ? sessionStorage.getItem('token') : 'N/A',
      user: typeof window !== 'undefined' ? sessionStorage.getItem('user') : 'N/A',
      loginTime: typeof window !== 'undefined' ? sessionStorage.getItem('loginTime') : 'N/A'
    },
    isAuthenticated: authService.isAuthenticated(),
    isSessionValid: authService.isSessionValid()
  });

  useEffect(() => {
    // Check session validity every minute
    const checkSession = () => {
      if (!authService.isSessionValid()) {
        setIsSessionExpired(true);
        // Auto-logout after session expires
        setTimeout(() => {
          authService.logout();
          router.push('/');
        }, 3000);
        return;
      }
      
      const timeRemaining = authService.getSessionTimeRemaining();
      setSessionTimeRemaining(timeRemaining);
      
      // Show warning when less than 30 minutes remaining
      if (timeRemaining <= 30 && timeRemaining > 0) {
        setIsSessionExpired(false);
      }
    };

    // Initial check
    checkSession();
    
    // Set up interval to check every minute
    const interval = setInterval(checkSession, 60000);
    
    return () => clearInterval(interval);
  }, [router]);

  const handleRoleSwitch = async () => {
    // Check session before switching
    if (!authService.isSessionValid()) {
      setIsSessionExpired(true);
      setTimeout(() => {
        authService.logout();
        router.push('/');
      }, 2000);
      return;
    }

    setIsToggling(true);
    
    // Add a small delay for smooth transition
    setTimeout(() => {
      if (hasHR && hasInterviewer) {
        if (currentRole === 'HR') {
          router.push('/interviewer');
        } else {
          router.push('/hr');
        }
      }
      setIsToggling(false);
    }, 200);
  };

  // Show session expired message
  if (isSessionExpired) {
    return (
      <div className="flex items-center space-x-2 text-red-600">
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">Session Expired</span>
      </div>
    );
  }

  // Show session warning when less than 30 minutes remaining
  const showSessionWarning = sessionTimeRemaining !== null && sessionTimeRemaining <= 30 && sessionTimeRemaining > 0;

  return (
    <div className="flex items-center space-x-2">
      {showSessionWarning && (
        <div className="flex items-center space-x-1 text-orange-600 text-xs">
          <Clock className="w-3 h-3" />
          <span>{sessionTimeRemaining}m left</span>
        </div>
      )}
      
      <Button
        onClick={handleRoleSwitch}
        variant="outline"
        size="sm"
        disabled={!userDataLoaded || isToggling || !(hasHR && hasInterviewer) || isSessionExpired}
        className={`transition-all duration-200 flex items-center ${
          showSessionWarning ? 'border-orange-300 bg-orange-50' : ''
        }`}
      >
        {!userDataLoaded || isToggling ? (
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2" />
        ) : currentRole === 'HR' ? (
          <Users className="w-4 h-4 mr-2 text-blue-600" />
        ) : (
          <Briefcase className="w-4 h-4 mr-2 text-green-600" />
        )}
        <span className="font-medium">{!userDataLoaded ? 'Loading...' : currentRole}</span>
      </Button>
    </div>
  );
}