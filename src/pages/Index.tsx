import { useAuth } from '@/contexts/AuthContext';
import { MessageCircle } from 'lucide-react';
import AuthPage from './AuthPage';
import ChatListPage from './ChatListPage';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-lg animate-pulse">
          <MessageCircle className="w-7 h-7 text-primary-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">Vibe</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <ChatListPage />;
};

export default Index;
