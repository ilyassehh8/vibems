import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Users, User, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const items = [
    { path: '/', icon: MessageCircle, label: t('chats'), match: (p: string) => p === '/' },
    { path: '/friends', icon: Users, label: t('friends'), match: (p: string) => p.startsWith('/friends') },
    { path: '/communities', icon: Globe, label: t('communities'), match: (p: string) => p.startsWith('/communities') },
    { path: '/profile', icon: User, label: t('profile'), match: (p: string) => p.startsWith('/profile') },
  ];

  const activeIdx = items.findIndex(it => it.match(location.pathname));

  return (
    <nav className="relative flex items-center justify-around border-t border-border/60 glass-strong py-1.5 safe-area-pb">
      {/* Morphing pill indicator */}
      {activeIdx >= 0 && (
        <div
          className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-2xl bg-accent/10 transition-all duration-500 ease-spring"
          style={{
            left: `calc(${(activeIdx / items.length) * 100}% + 4px)`,
            width: `calc(${100 / items.length}% - 8px)`,
          }}
        />
      )}

      {items.map(item => {
        const Icon = item.icon;
        const active = item.match(location.pathname);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'relative z-10 flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-2xl transition-all duration-300 press',
              active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon
              strokeWidth={active ? 2.4 : 1.8}
              className={cn(
                'w-5 h-5 transition-all duration-500 ease-spring',
                active ? 'scale-110 -translate-y-0.5' : 'scale-100'
              )}
            />
            <span className={cn(
              'text-[10px] font-semibold tracking-tight transition-all',
              active ? 'opacity-100' : 'opacity-70'
            )}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
