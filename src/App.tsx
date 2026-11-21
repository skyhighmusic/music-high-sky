import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LayoutShell } from './components/LayoutShell';
import { LoginView } from './components/LoginView';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { PlayerProvider } from './context/PlayerContext';
import type { NavSection, ReleaseType } from './types';

// Lazy-loaded workspace views to keep initial JS bundle lean and split heavy libraries
// (Three.js 3D Stage, Recharts Analytics, Google Maps Tours, jsPDF/XLSX Reports, AI Studio)
const DashboardView = lazy(() =>
  import('./views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const ArtistProfileView = lazy(() =>
  import('./views/ArtistProfileView').then((m) => ({ default: m.ArtistProfileView }))
);
const PlaylistsView = lazy(() =>
  import('./views/PlaylistsView').then((m) => ({ default: m.PlaylistsView }))
);
const ImportManagementView = lazy(() =>
  import('./views/ImportManagementView').then((m) => ({ default: m.ImportManagementView }))
);
const ReleasesLibraryView = lazy(() =>
  import('./views/ReleasesLibraryView').then((m) => ({ default: m.ReleasesLibraryView }))
);
const NewReleaseView = lazy(() =>
  import('./views/NewReleaseView').then((m) => ({ default: m.NewReleaseView }))
);
const ReleaseCalendarView = lazy(() =>
  import('./views/ReleaseCalendarView').then((m) => ({ default: m.ReleaseCalendarView }))
);
const DistributionManagementView = lazy(() =>
  import('./views/DistributionManagementView').then((m) => ({
    default: m.DistributionManagementView,
  }))
);
const AnalyticsRoyaltiesView = lazy(() =>
  import('./views/AnalyticsRoyaltiesView').then((m) => ({ default: m.AnalyticsRoyaltiesView }))
);
const CopyrightManagementView = lazy(() =>
  import('./views/CopyrightManagementView').then((m) => ({ default: m.CopyrightManagementView }))
);
const MarketingCenterView = lazy(() =>
  import('./views/MarketingCenterView').then((m) => ({ default: m.MarketingCenterView }))
);
const AiCreativeStudioView = lazy(() =>
  import('./views/AiCreativeStudioView').then((m) => ({ default: m.AiCreativeStudioView }))
);
const AiAssistantView = lazy(() =>
  import('./views/AiAssistantView').then((m) => ({ default: m.AiAssistantView }))
);
const TourMapsView = lazy(() =>
  import('./views/TourMapsView').then((m) => ({ default: m.TourMapsView }))
);
const StudioStage3DView = lazy(() =>
  import('./views/StudioStage3DView').then((m) => ({ default: m.StudioStage3DView }))
);
const DocumentsReportsView = lazy(() =>
  import('./views/DocumentsReportsView').then((m) => ({ default: m.DocumentsReportsView }))
);
const NotificationsView = lazy(() =>
  import('./views/NotificationsUsersSettingsView').then((m) => ({ default: m.NotificationsView }))
);
const UserManagementView = lazy(() =>
  import('./views/NotificationsUsersSettingsView').then((m) => ({ default: m.UserManagementView }))
);
const SettingsView = lazy(() =>
  import('./views/NotificationsUsersSettingsView').then((m) => ({ default: m.SettingsView }))
);

const SPLASH_BARS = [16, 28, 42, 24, 52, 34, 48, 22, 38, 26, 44, 18];

const WorkspaceViewLoader: React.FC = () => (
  <div className="min-h-[55vh] flex flex-col items-center justify-center gap-4 p-8">
    <div className="flex items-end justify-center gap-1.5 h-10" aria-hidden="true">
      {SPLASH_BARS.slice(0, 8).map((height, idx) => (
        <span
          key={idx}
          className="w-1 rounded-full bg-gradient-to-t from-[#0759C7] via-[#00A8FF] to-[#F5D58A] animate-wave-bar"
          style={{
            height: `${Math.round(height * 0.6)}px`,
            animationDelay: `${idx * 0.09}s`,
          }}
        />
      ))}
    </div>
    <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#C8D0DB]">
      Loading Module...
    </p>
  </div>
);

const MusicHighSkyWorkspace: React.FC = () => {
  const { authLoading, currentUser, brandLogoUrl } = usePlatform();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [newReleaseDefaultType, setNewReleaseDefaultType] = useState<ReleaseType>('audio');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#020817] text-white flex flex-col items-center justify-center gap-6 p-6 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,168,255,0.16),transparent_42%),radial-gradient(circle_at_50%_58%,rgba(212,175,55,0.12),transparent_48%)]"
        />
        <div className="relative flex flex-col items-center gap-5">
          <div className="p-1.5 rounded-full bg-gradient-to-br from-[#F5D58A]/45 via-[#00A8FF]/30 to-[#A87922]/45 shadow-[0_0_50px_-10px_rgba(212,175,55,0.45)]">
            <img
              src={brandLogoUrl}
              alt="Music High Sky"
              referrerPolicy="no-referrer"
              className="w-24 h-24 rounded-full object-contain bg-[#020817]"
            />
          </div>

          <div className="flex items-end justify-center gap-1.5 h-10" aria-hidden="true">
            {SPLASH_BARS.map((height, idx) => (
              <span
                key={idx}
                className="w-1 rounded-full bg-gradient-to-t from-[#0759C7] via-[#00A8FF] to-[#00D5FF] animate-wave-bar"
                style={{
                  height: `${Math.round(height * 0.65)}px`,
                  animationDelay: `${idx * 0.1}s`,
                }}
              />
            ))}
          </div>

          <div className="text-center space-y-1">
            <p className="font-display text-sm tracking-[0.26em] text-gold-gradient font-bold">
              MUSIC HIGH SKY
            </p>
            <p className="text-xs text-[#8D9AAA]">
              Initializing Official Label Console...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  if (currentUser.status === 'suspended') {
    return (
      <div className="min-h-screen bg-[#020817] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full luxury-card border-[#D4AF37]/40 rounded-2xl p-7 text-center space-y-4">
          <img
            src={brandLogoUrl}
            alt="Music High Sky"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-full object-contain mx-auto ring-1 ring-[#D4AF37]/50 bg-[#020817]"
          />
          <h2 className="font-display text-xl font-bold text-[#F5D58A]">Account Suspended</h2>
          <p className="text-xs text-[#C8D0DB] leading-relaxed">
            Your Music High Sky workspace access is currently suspended. Please contact the Super Administrator to restore permissions.
          </p>
        </div>
      </div>
    );
  }

  const openNewRelease = (type: ReleaseType) => {
    setNewReleaseDefaultType(type);
    setActiveSection('new-release');
  };

  return (
    <LayoutShell activeSection={activeSection} onNavigate={setActiveSection}>
      <Suspense fallback={<WorkspaceViewLoader />}>
        {activeSection === 'dashboard' && <DashboardView onNavigate={setActiveSection} />}
        {activeSection === 'artist-profile' && (
          <ArtistProfileView onNavigate={setActiveSection} />
        )}
        {activeSection === 'playlists' && <PlaylistsView />}
        {activeSection === 'import-manager' && <ImportManagementView />}
        {activeSection === 'music-library' && (
          <ReleasesLibraryView
            releaseType="all"
            onCreateNew={openNewRelease}
            onNavigate={setActiveSection}
          />
        )}
        {activeSection === 'audio-releases' && (
          <ReleasesLibraryView
            releaseType="audio"
            onCreateNew={openNewRelease}
            onNavigate={setActiveSection}
          />
        )}
        {activeSection === 'video-releases' && (
          <ReleasesLibraryView
            releaseType="video"
            onCreateNew={openNewRelease}
            onNavigate={setActiveSection}
          />
        )}
        {activeSection === 'new-release' && (
          <NewReleaseView
            defaultType={newReleaseDefaultType}
            onSuccessNavigate={setActiveSection}
          />
        )}
        {activeSection === 'release-calendar' && <ReleaseCalendarView />}
        {activeSection === 'distribution' && <DistributionManagementView />}
        {activeSection === 'analytics' && <AnalyticsRoyaltiesView mode="analytics" />}
        {activeSection === 'royalties' && <AnalyticsRoyaltiesView mode="royalties" />}
        {activeSection === 'copyright' && <CopyrightManagementView />}
        {activeSection === 'marketing' && <MarketingCenterView />}
        {activeSection === 'ai-studio' && <AiCreativeStudioView />}
        {activeSection === 'ai-assistant' && <AiAssistantView />}
        {activeSection === 'tour-maps' && <TourMapsView />}
        {activeSection === 'studio-3d' && <StudioStage3DView />}
        {activeSection === 'reports' && <DocumentsReportsView />}
        {activeSection === 'notifications' && <NotificationsView />}
        {activeSection === 'users' && <UserManagementView />}
        {activeSection === 'settings' && <SettingsView />}
      </Suspense>
    </LayoutShell>
  );
};

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  return (
    <ErrorBoundary>
      {gmpQuotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-[100] bg-amber-950/95 border-b border-amber-400/50 text-amber-100 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3"
        >
          <span>
            Google Maps Platform demo quota reached or key authentication failed.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-200 hover:text-white"
            >
              Learn how to resolve quota exceeded errors
            </a>
          </span>
          <button
            type="button"
            onClick={() => setGmpQuotaExceeded(false)}
            className="px-2 py-0.5 rounded bg-amber-900/70 hover:bg-amber-800 text-amber-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
      <PlatformProvider>
        <PlayerProvider>
          <MusicHighSkyWorkspace />
        </PlayerProvider>
      </PlatformProvider>
    </ErrorBoundary>
  );
}
