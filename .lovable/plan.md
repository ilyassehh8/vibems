

# Make the App User-Friendly — Plan

## Overview
Improve the UX across all screens with better visual feedback, smoother interactions, tooltips, empty states, transitions, and small polish details that make the app feel professional and intuitive.

## Changes

### 1. Auth Page — Better Onboarding
- Add a subtle tagline/description below the logo ("Connect with friends instantly")
- Add password strength indicator on sign-up
- Show/hide password toggle (eye icon)
- Animate form transition between sign-in and sign-up

### 2. Chat List Page — Cleaner Header & Better UX
- Add tooltips to all header icon buttons so users know what each does
- Show avatar images (not just initials) when users have uploaded profile pictures
- Add a floating action button (FAB) for new chat instead of cramming icons in header
- Move settings, theme toggle, and sign-out into a dropdown menu to reduce header clutter
- Add a subtle loading skeleton instead of plain "Loading..." text
- Show unread message count badge on conversations

### 3. Chat Page — Smoother Experience
- Add a typing indicator area
- Show avatar in message bubbles for group chats
- Add smooth scroll-to-bottom button when scrolled up
- Add emoji picker button next to the message input
- Better empty state with illustration/icon

### 4. Profile Page — Polish
- Add confirmation before navigating away with unsaved changes
- Better visual sections with card-style grouping
- Show username prominently as non-editable field

### 5. Friends Page — Clarity
- Add descriptive helper text on the "Add" tab explaining what to do
- Show loading states while searching
- Add animation when friend request is accepted

### 6. Global UX Improvements
- Add page transition animations (fade in/out)
- Add haptic-style micro-interactions on buttons (scale on press)
- Improve the loading/splash screen with app branding
- Add a bottom navigation bar on mobile for quick access to Chats, Friends, and Profile (replacing the icon-heavy header)
- Show user's own avatar in the header/nav

## Technical Details
- **Bottom nav**: New `BottomNav` component rendered on chat list, friends, and profile pages
- **Tooltips**: Use existing `Tooltip` component from shadcn/ui
- **Dropdown menu**: Use existing `DropdownMenu` component for settings overflow
- **Animations**: CSS transitions + Tailwind `animate-` classes
- **Skeleton loading**: Use existing `Skeleton` component from shadcn/ui
- **Scroll-to-bottom**: New floating button in ChatPage that appears when user scrolls up
- **Files to create**: `src/components/BottomNav.tsx`
- **Files to edit**: `AuthPage.tsx`, `ChatListPage.tsx`, `ChatPage.tsx`, `ProfilePage.tsx`, `FriendsPage.tsx`, `CreateGroupPage.tsx`, `Index.tsx`, `translations.ts`, `index.css`

