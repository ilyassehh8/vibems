import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import IncomingCallListener from "@/components/chat/IncomingCallListener";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import ChatPage from "./pages/ChatPage.tsx";
import FriendsPage from "./pages/FriendsPage.tsx";
import CreateGroupPage from "./pages/CreateGroupPage.tsx";
import ProfilePage from "./pages/ProfilePage.tsx";
import CommunitiesPage from "./pages/CommunitiesPage.tsx";
import CreateCommunityPage from "./pages/CreateCommunityPage.tsx";
import CommunityServerPage from "./pages/CommunityServerPage.tsx";
import CommunityRolesPage from "./pages/CommunityRolesPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Sonner />
            <IncomingCallListener />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/chat/:id" element={<ChatPage />} />
                <Route path="/friends" element={<FriendsPage />} />
                <Route path="/group/new" element={<CreateGroupPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/communities" element={<CommunitiesPage />} />
                <Route path="/communities/new" element={<CreateCommunityPage />} />
                <Route path="/communities/:id" element={<CommunityServerPage />} />
                <Route path="/communities/:id/roles" element={<CommunityRolesPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
