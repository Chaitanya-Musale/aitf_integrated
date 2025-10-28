'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authService } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authService.isAuthenticated()) {
      const user = authService.getUser();
      if (user?.roles?.includes('Admin')) {
        router.push('/admin');
      }
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await authService.adminLogin(email, password);
      setTimeout(() => {
        if (result.user.roles?.includes('Admin')) router.push('/admin');
        else setError('This account is not an Admin');
      }, 150);
    } catch (err) {
      setError(err.message || 'Admin login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-50 to-gray-100 transition-opacity duration-300">
      {/* Left - Admin Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 lg:px-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-white shadow-xl border border-gray-200 flex items-center justify-center">
              <Image src="/atf.png" alt="ATF Logo" width={48} height={48} className="object-contain" />
            </div>
          </div>

          <Card className="w-full transform transition-all duration-300 hover:shadow-2xl shadow-xl animate-fade-in-up">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">AITF</CardTitle>
              <CardDescription className="text-gray-600">Admin sign in</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your admin email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="transition-all duration-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="transition-all duration-200 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="text-right -mt-2">
                  <a href="/forgot-password" className="text-sm text-blue-600 hover:underline">Forgot password?</a>
                </div>
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md transition-all duration-300">{error}</div>
                )}
                <Button type="submit" className="w-full transition-all duration-200 hover:shadow-lg transform hover:scale-[1.02]" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    'Sign In'
                  )}
                </Button>
                <div className="text-center text-sm text-gray-600 mt-2">
                  Not an admin? <a href="/" className="text-blue-600 hover:underline">Go to user login</a>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right - Graphic */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-8 relative overflow-hidden">
        <div className="relative w-full h-full max-w-lg opacity-0 animate-fade-in-right">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-80 h-80 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 opacity-20 absolute animate-pulse"></div>
            <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-slate-300 to-slate-400 opacity-30 absolute -top-16 -left-16 rotate-12 animate-float"></div>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 opacity-25 absolute top-20 right-12 animate-float-delayed"></div>
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 opacity-20 absolute bottom-24 left-20 rotate-45 animate-float"></div>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 opacity-15 absolute -bottom-10 -right-10 -rotate-12 animate-float-delayed"></div>
            <div className="absolute inset-0 opacity-5">
              <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
            </div>
            <div className="w-48 h-48 rounded-3xl bg-gradient-to-br from-white to-slate-100 shadow-2xl border border-slate-200 flex items-center justify-center">
              <div className="w-24 h-24 rounded-2xl bg-white/90 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden">
                  <Image src="/atf.png" alt="ATF Logo" width={48} height={48} className="object-contain" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float { 0%, 100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-20px) rotate(5deg); } }
        @keyframes float-delayed { 0%, 100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-15px) rotate(-3deg); } }
        @keyframes fade-in-right { 0% { opacity: 0; transform: translateX(20px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-delayed { animation: float-delayed 8s ease-in-out infinite; animation-delay: 2s; }
        .animate-fade-in-right { animation: fade-in-right 0.6s ease-out 0.2s forwards; }
        .animate-fade-in { animation: fade-in 0.8s ease-out; }
        .animate-fade-in-up { animation: fade-in-up 0.6s ease-out 0.1s both; }
      `}</style>
    </div>
  );
}
