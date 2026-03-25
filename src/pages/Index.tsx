import { useAuth } from '@/contexts/AuthContext';
import AuthPage from './AuthPage';
import ChatListPage from './ChatListPage';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 rounded-xl gradient-primary animate-pulse" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <ChatListPage />;
};

export default Index;
