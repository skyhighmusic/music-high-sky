import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  UserCheck,
  Library,
  Music,
  Film,
  PlusCircle,
  CalendarDays,
  Share2,
  BarChart3,
  Wallet,
  ShieldCheck,
  Megaphone,
  FileSpreadsheet,
  Bell,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  Wand2,
  MessageSquare,
  MapPin,
  Box,
  ListMusic,
  CloudDownload,
} from 'lucide-react';
import { ROLE_LABELS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import { usePlayer } from '../context/PlayerContext';
import { PersistentMusicPlayer } from './PersistentMusicPlayer';
import type { NavSection } from '../types';

interface LayoutShellProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'artist-profile', label: 'Artist Profile', icon: UserCheck },
  { id: 'playlists', label: 'Official Playlists', icon: ListMusic },
  { id: 'music-library', label: 'Music Library', icon: Library },
  { id: 'audio-releases', label: 'Audio Releases', icon: Music },
  { id: 'video-releases', label: 'Video Releases', icon: Film },
  { id: 'import-manager', label: 'Google Drive Import', icon: CloudDownload },
  { id: 'new-release', label: 'New Release Submission', icon: PlusCircle },
  { id: 'release-calendar', label: 'Release Calendar', icon: CalendarDays },
  { id: 'distribution', label: 'Distribution Management', icon: Share2 },
  { id: 'analytics', label: 'Music Analytics', icon: BarChart3 },
  { id: 'royalties', label: 'Royalties & Payments', icon: Wallet },
  { id: 'copyright', label: 'Copyright Management', icon: ShieldCheck },
  { id: 'marketing', label: 'Marketing Center', icon: Megaphone },
  { id: 'ai-studio', label: 'AI Creative Studio', icon: Wand2 },
  { id: 'ai-assistant', label: 'A&R Chat & Live Voice', icon: MessageSquare },
  { id: 'tour-maps', label: 'Tour & Venues Map', icon: MapPin },
  { id: 'studio-3d', label: '3D Studio Stage', icon: Box },
  { id: 'reports', label: 'Documents & Reports', icon: FileSpreadsheet },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activeSection,
  onNavigate,
  children,
}) => {
  const {
    currentUser,
    artist,
    brandLogoUrl,
    artistPhotoUrl,
    logout,
    notifications,
    toasts,
    dismissToast,
  } = usePlatform();
  const { currentTrack } = usePlayer();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleNavClick = (id: NavSection) => {
    onNavigate(id);
    setMobileOpen(false);
    setProfileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#040D22] via-[#020817] to-[#030509] border-r border-[#D4AF37]/25">
      {/* Official Music High Sky Logo Lockup */}
      <div className="px-5 py-5 border-b border-[#D4AF37]/20 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => handleNavClick('dashboard')}
          className="flex items-center gap-3 text-left min-w-0 cursor-pointer group"
        >
          <div className="p-0.5 rounded-full bg-gradient-to-br from-[#F5D58A]/70 via-[#D4AF37]/40 to-[#00A8FF]/50 shrink-0">
            <img
              src={brandLogoUrl}
              alt="Music High Sky Official Logo"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-full object-contain bg-[#030509]"
            />
          </div>
          <div className="min-w-0">
            <span className="block font-display text-sm font-bold tracking-[0.08em] text-gold-gradient truncate">
              MUSIC HIGH SKY
            </span>
            <span className="block text-[11px] text-[#8D9AAA] truncate">
              {artist.name} · Official Label
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-[#C8D0DB] hover:text-white rounded-md cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Items with Metallic Gold Active Indicator */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-3.5 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-[#D4AF37]/18 via-[#D4AF37]/8 to-transparent text-[#F5D58A] ring-1 ring-[#D4AF37]/40 shadow-[0_0_16px_-6px_rgba(212,175,55,0.35)]'
                  : 'text-[#C8D0DB] hover:text-white hover:bg-[#06152E]/85'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    active ? 'text-[#F5D58A]' : 'text-white/75'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span className="text-[11px] font-mono tabular-nums font-bold text-[#00D5FF] shrink-0">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Gold Hairline & Logout */}
      <div className="p-3 border-t border-[#D4AF37]/20 space-y-2">
        {currentUser && (
          <div className="px-2.5 py-2 flex items-center gap-2.5 min-w-0 rounded-lg bg-[#06152E]/55 border border-[#D4AF37]/15">
            <img
              src={currentUser.photoURL || artistPhotoUrl}
              alt={currentUser.displayName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-[#D4AF37]/50"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser.displayName}
              </p>
              <p className="text-[11px] text-[#F5D58A]/85 truncate">
                {ROLE_LABELS[currentUser.role]}
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[#C8D0DB] hover:text-rose-300 hover:bg-rose-950/30 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020817] text-white flex relative">
      {/* Subtle Ambient Background Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(0,168,255,0.07)_0%,_transparent_45%),radial-gradient(ellipse_at_bottom_left,_rgba(212,175,55,0.05)_0%,_transparent_45%)]"
      />

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Executive Luxury Header */}
        <header className="sticky top-0 z-30 h-16 bg-[#020817]/90 backdrop-blur-md border-b border-[#D4AF37]/20 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-[#C8D0DB] hover:text-white rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img
              src={brandLogoUrl}
              alt="Music High Sky"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-contain bg-[#030509] ring-1 ring-[#D4AF37]/45 shrink-0 lg:hidden"
            />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-white truncate">
                Welcome Back,{' '}
                <span className="text-[#F5D58A]">Sunil Kumar</span>
              </p>
              <p className="hidden sm:block text-[11px] text-[#8D9AAA] truncate">
                Music High Sky · Official Music Distribution &amp; Artist Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            {activeSection !== 'new-release' && (
              <button
                type="button"
                onClick={() => handleNavClick('new-release')}
                className="btn-gold inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Release</span>
                <span className="sm:hidden">Submit</span>
              </button>
            )}

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => handleNavClick('notifications')}
              aria-label="View notifications"
              className="relative p-2 rounded-lg bg-[#06152E]/80 border border-[#D4AF37]/25 hover:border-[#00A8FF]/60 text-white transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00A8FF] text-[#020817] text-[10px] font-bold font-mono flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Dropdown (Settings & Logout) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                aria-label="Account menu"
                className="flex items-center gap-2 p-1 pr-2 rounded-full bg-[#06152E]/80 border border-[#D4AF37]/30 hover:border-[#F5D58A]/65 transition-colors cursor-pointer"
              >
                <img
                  src={currentUser?.photoURL || artistPhotoUrl}
                  alt={currentUser?.displayName || 'Account'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover"
                />
                <ChevronDown className="w-3.5 h-3.5 text-[#F5D58A]" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl luxury-card py-1.5 z-50 text-xs shadow-2xl">
                  <div className="px-3.5 py-2.5 border-b border-[#D4AF37]/20">
                    <p className="font-semibold text-white truncate">
                      {currentUser?.displayName}
                    </p>
                    <p className="text-[11px] text-[#8D9AAA] truncate">{currentUser?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavClick('artist-profile')}
                    className="w-full px-3.5 py-2 text-left text-[#C8D0DB] hover:text-white hover:bg-[#06152E] flex items-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#F5D58A]" />
                    Artist Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('settings')}
                    className="w-full px-3.5 py-2 text-left text-[#C8D0DB] hover:text-white hover:bg-[#06152E] flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#00A8FF]" />
                    Settings
                  </button>
                  <div className="my-1 border-t border-[#D4AF37]/15" />
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full px-3.5 py-2 text-left text-rose-300 hover:bg-rose-950/35 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main
          className={`flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1440px] w-full mx-auto ${
            currentTrack ? 'pb-28' : ''
          }`}
        >
          {children}
        </main>
      </div>

      {/* Persistent Global Music Streaming Player */}
      <PersistentMusicPlayer />

      {/* Luxury Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className={`fixed right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2.5rem)] transition-all ${
            currentTrack ? 'bottom-24' : 'bottom-5'
          }`}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl luxury-card text-sm shadow-2xl"
            >
              {toast.tone === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-[#F5D58A] shrink-0 mt-0.5" />
              )}
              {toast.tone === 'error' && (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              {toast.tone === 'info' && (
                <Info className="w-4 h-4 text-[#00D5FF] shrink-0 mt-0.5" />
              )}
              <p className="text-white text-xs leading-relaxed flex-1">{toast.text}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss message"
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
