import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Upload,
  Megaphone,
  FileSpreadsheet,
  ArrowUpRight,
  Loader2,
  Check,
  Copy,
  X,
  RefreshCw,
  FileDown,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { MarketingKit, NavSection, ReleaseRecord } from '../types';
import { exportExcelWorkbook, exportRoyaltiesPdf } from '../utils/reportExport';

interface DashboardQuickActionsWidgetProps {
  onNavigate: (section: NavSection) => void;
}

type SocialChannelTab = 'instagram' | 'facebook' | 'announcement' | 'hashtags';

export const DashboardQuickActionsWidget: React.FC<DashboardQuickActionsWidgetProps> = ({
  onNavigate,
}) => {
  const { artist, releases, royalties, settings, pushToast } = usePlatform();

  // Social Post quick-generation state
  const [socialModalOpen, setSocialModalOpen] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>('');
  const [generatingSocial, setGeneratingSocial] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [generatedKit, setGeneratedKit] = useState<MarketingKit | null>(null);
  const [generatedForTitle, setGeneratedForTitle] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SocialChannelTab>('instagram');
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  // Royalty Report generation state
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const audioCount = useMemo(
    () => releases.filter((r) => r.releaseType === 'audio').length,
    [releases]
  );
  const videoCount = useMemo(
    () => releases.filter((r) => r.releaseType === 'video').length,
    [releases]
  );

  // Pick best default release for instant 1-click social post generation (featured > latest)
  const defaultRelease: ReleaseRecord | null = useMemo(() => {
    if (releases.length === 0) return null;
    const featured = releases.find((r) => r.featured);
    if (featured) return featured;
    return [...releases].sort((a, b) =>
      (b.plannedReleaseDate || b.submissionDate || '').localeCompare(
        a.plannedReleaseDate || a.submissionDate || ''
      )
    )[0];
  }, [releases]);

  const activeRelease: ReleaseRecord | null = useMemo(() => {
    if (selectedReleaseId) {
      return releases.find((r) => r.id === selectedReleaseId) ?? defaultRelease;
    }
    return defaultRelease;
  }, [releases, selectedReleaseId, defaultRelease]);

  const confirmedRoyaltyTotal = useMemo(
    () => royalties.reduce((sum, r) => sum + (Number(r.confirmedRoyalty) || 0), 0),
    [royalties]
  );
  const currencySymbol = (settings.defaultCurrency || 'INR') === 'USD' ? '$' : '₹';

  const runSocialPostGeneration = async (targetRelease: ReleaseRecord | null) => {
    setSocialModalOpen(true);
    setGeneratingSocial(true);
    setSocialError(null);

    const titleToUse = targetRelease?.title || `${artist.name} — New Music High Sky Release`;
    setGeneratedForTitle(titleToUse);

    try {
      const response = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToUse,
          subtitle: targetRelease?.subtitle || '',
          primaryArtist: targetRelease?.primaryArtist || artist.name,
          featuredArtist: targetRelease?.featuredArtist || '',
          releaseType: targetRelease?.releaseType || 'audio',
          genre: targetRelease?.genre || artist.genres[0] || 'Hindi',
          subgenre: targetRelease?.subgenre || '',
          language: targetRelease?.language || 'Hindi',
          mood: targetRelease?.mood || 'Emotional',
          plannedReleaseDate: targetRelease?.plannedReleaseDate || '',
          distributorLabel: targetRelease?.distributorLabel || artist.label || 'Music High Sky',
          lyricist: targetRelease?.lyricist || artist.name,
          composer: targetRelease?.composer || artist.name,
          musicProducer: targetRelease?.musicProducer || '',
          customAngle: 'Ready-to-publish social media post for fans and streaming listeners.',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.kit) {
        throw new Error(data?.error || 'Unable to generate social post right now.');
      }

      setGeneratedKit(data.kit as MarketingKit);
      setActiveTab('instagram');
      pushToast(`Marketing social post ready for "${titleToUse}".`, 'success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to generate marketing social post.';
      setSocialError(message);
      pushToast(message, 'error');
    } finally {
      setGeneratingSocial(false);
    }
  };

  const handleGenerateSocialClick = () => {
    const target = activeRelease;
    if (target && !selectedReleaseId) {
      setSelectedReleaseId(target.id);
    }
    void runSocialPostGeneration(target);
  };

  const handleCreateRoyaltyReport = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await exportRoyaltiesPdf(royalties, `Music-High-Sky-Royalty-Report-${today}.pdf`);
      pushToast(
        royalties.length > 0
          ? `Royalty Report PDF downloaded (${royalties.length} verified entries).`
          : 'Branded Royalty Report PDF downloaded (0 verified entries recorded yet).',
        'success'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Failed to generate Royalty Report PDF.',
        'error'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportRoyaltyExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await exportExcelWorkbook(
        [
          {
            name: 'Royalty Ledger',
            rows: royalties.map((r) => ({
              Period: r.period,
              Release: r.releaseTitle,
              Platform: r.platformName,
              Territory: r.territory || 'Global',
              Streams: r.streams,
              Currency: r.currency,
              EstimatedRoyalty: r.estimatedRoyalty,
              ConfirmedRoyalty: r.confirmedRoyalty,
              PaymentStatus: r.paymentStatus,
              Source: r.sourceType,
            })),
          },
        ],
        `Music-High-Sky-Royalty-Report-${today}.xlsx`
      );
      pushToast('Royalty Report Excel workbook downloaded.', 'success');
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Failed to export Excel royalty report.',
        'error'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const activeSocialText = useMemo(() => {
    if (!generatedKit) return '';
    switch (activeTab) {
      case 'instagram':
        return (generatedKit.instagramCaptions || []).join('\n\n---\n\n');
      case 'facebook':
        return generatedKit.facebookPost || '';
      case 'announcement':
        return generatedKit.releaseAnnouncement || '';
      case 'hashtags':
        return (generatedKit.trendingHashtags || []).join(' ');
    }
  }, [generatedKit, activeTab]);

  const handleCopyActivePost = async () => {
    if (!activeSocialText) return;
    try {
      await navigator.clipboard.writeText(activeSocialText);
      setCopiedTab(activeTab);
      pushToast('Social post copied to clipboard.', 'success');
      window.setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      pushToast('Clipboard access was blocked by the browser.', 'error');
    }
  };

  return (
    <>
      <section
        aria-label="Quick Actions"
        className="luxury-card rounded-2xl overflow-hidden"
      >
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-[#D4AF37]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-[#F5D58A] tracking-wide">
              Quick Actions
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-0.5">
              One-click label workflows for {artist.name} · {artist.label}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#8D9AAA] shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('marketing')}
              className="hover:text-[#F5D58A] transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              Marketing Center
            </button>
            <span aria-hidden="true" className="text-[#D4AF37]/30">
              ·
            </span>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="hover:text-[#00D5FF] transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              All Reports
            </button>
          </div>
        </div>

        {/* 3 Single-Elevation Action Columns separated by hairline dividers */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#D4AF37]/15">
          {/* 1. Upload New Track */}
          <div className="p-5 flex flex-col justify-between gap-4 hover:bg-[#06152E]/55 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Upload New Track</span>
                <Upload className="w-4 h-4 text-[#F5D58A] shrink-0" aria-hidden="true" />
              </div>
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                Submit a studio WAV, MP3, or FLAC master with artwork, lyrics, and DSP distribution metadata.
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#C8D0DB]/80">
                {audioCount} audio · {videoCount} video in catalog
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('new-release')}
                className="btn-gold min-h-[40px] px-4 py-2 text-xs rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload New Track</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('audio-releases')}
                className="text-[11px] text-[#8D9AAA] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Audio Library
              </button>
            </div>
          </div>

          {/* 2. Generate Marketing Social Post */}
          <div className="p-5 flex flex-col justify-between gap-4 hover:bg-[#06152E]/55 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  Generate Marketing Social Post
                </span>
                <Megaphone className="w-4 h-4 text-[#00D5FF] shrink-0" aria-hidden="true" />
              </div>
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                Draft Instagram captions, Facebook copy, release announcements, and hashtags in one click.
              </p>
              <p className="text-[11px] text-[#C8D0DB]/80 truncate">
                Target: {defaultRelease ? defaultRelease.title : `${artist.name} Official Catalog`}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                disabled={generatingSocial}
                onClick={handleGenerateSocialClick}
                className="btn-electric min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D58A]"
              >
                {generatingSocial ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Megaphone className="w-3.5 h-3.5" />
                )}
                <span>{generatingSocial ? 'Generating...' : 'Generate Social Post'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('marketing')}
                className="text-[11px] text-[#8D9AAA] hover:text-white inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>Full Kit</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 3. Create Royalty Report */}
          <div className="p-5 flex flex-col justify-between gap-4 hover:bg-[#06152E]/55 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Create Royalty Report</span>
                <FileSpreadsheet className="w-4 h-4 text-[#F5D58A] shrink-0" aria-hidden="true" />
              </div>
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                Export an official Music High Sky royalty statement directly from verified Firestore ledger entries.
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#C8D0DB]/80">
                {royalties.length} statements · {currencySymbol}
                {confirmedRoyaltyTotal.toFixed(2)} confirmed
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => void handleCreateRoyaltyReport()}
                className="btn-gold min-h-[40px] px-4 py-2 text-xs rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF]"
              >
                {exportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5" />
                )}
                <span>{exportingPdf ? 'Creating PDF...' : 'Create Royalty Report'}</span>
              </button>
              <div className="flex items-center gap-2.5 text-[11px] shrink-0">
                <button
                  type="button"
                  disabled={exportingExcel}
                  onClick={() => void handleExportRoyaltyExcel()}
                  className="text-[#00D5FF] hover:text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {exportingExcel ? 'Exporting...' : 'Excel'}
                </button>
                <span aria-hidden="true" className="text-[#D4AF37]/30">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('royalties')}
                  className="text-[#8D9AAA] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  Ledger
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Instant Marketing Social Post Modal */}
      <AnimatePresence>
        {socialModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Generated Marketing Social Post"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSocialModalOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl luxury-card rounded-2xl border border-[#D4AF37]/35 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-[#D4AF37]/20 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#00D5FF]">
                    Music High Sky · Social Copy Generator
                  </p>
                  <h4 className="font-display text-lg font-bold text-[#F5D58A] truncate">
                    {generatedForTitle || 'Marketing Social Post'}
                  </h4>
                </div>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setSocialModalOpen(false)}
                  className="p-2 rounded-lg text-[#8D9AAA] hover:text-white hover:bg-[#06152E] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Release Selector Bar */}
              {releases.length > 0 && (
                <div className="px-6 py-3 bg-[#030509]/70 border-b border-[#D4AF37]/15 flex flex-col sm:flex-row sm:items-center gap-3">
                  <label
                    htmlFor="quick-social-release-select"
                    className="text-xs font-medium text-[#C8D0DB] whitespace-nowrap"
                  >
                    Release
                  </label>
                  <select
                    id="quick-social-release-select"
                    value={activeRelease?.id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedReleaseId(nextId);
                      const nextRel = releases.find((r) => r.id === nextId) ?? null;
                      void runSocialPostGeneration(nextRel);
                    }}
                    className="flex-1 luxury-input px-3 py-2 text-xs rounded-lg"
                  >
                    {releases.map((r) => (
                      <option key={r.id} value={r.id} className="bg-[#030509] text-white">
                        {r.title} ({r.releaseType === 'video' ? 'Video' : 'Audio'} · {r.language})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={generatingSocial}
                    onClick={() => void runSocialPostGeneration(activeRelease)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#F5D58A] bg-[#06152E] border border-[#D4AF37]/30 hover:border-[#F5D58A] rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${generatingSocial ? 'animate-spin' : ''}`}
                    />
                    <span>Regenerate</span>
                  </button>
                </div>
              )}

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4">
                {generatingSocial ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                    <Loader2 className="w-7 h-7 text-[#00D5FF] animate-spin" />
                    <p className="text-sm font-medium text-white">
                      Crafting social posts for {generatedForTitle}...
                    </p>
                    <p className="text-xs text-[#8D9AAA]">
                      Tailoring captions, release announcement, and discovery hashtags.
                    </p>
                  </div>
                ) : socialError ? (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-sm font-semibold text-rose-400">{socialError}</p>
                    <p className="text-xs text-[#8D9AAA]">
                      You can retry or open the full Marketing Center to build your campaign manually.
                    </p>
                    <div className="flex justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => void runSocialPostGeneration(activeRelease)}
                        className="btn-gold px-4 py-2 text-xs rounded-lg cursor-pointer"
                      >
                        Retry Generation
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSocialModalOpen(false);
                          onNavigate('marketing');
                        }}
                        className="btn-electric px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Open Marketing Center
                      </button>
                    </div>
                  </div>
                ) : generatedKit ? (
                  <>
                    {/* Channel Segmented Tabs */}
                    <div
                      role="tablist"
                      aria-label="Social post format"
                      className="flex flex-wrap items-center gap-1 p-1 bg-[#030509] border border-[#D4AF37]/20 rounded-lg"
                    >
                      {(
                        [
                          { id: 'instagram', label: 'Instagram' },
                          { id: 'facebook', label: 'Facebook' },
                          { id: 'announcement', label: 'Announcement' },
                          { id: 'hashtags', label: 'Hashtags' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={activeTab === tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            activeTab === tab.id
                              ? 'bg-[#D4AF37] text-[#030509]'
                              : 'text-[#C8D0DB] hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Generated Post Output */}
                    <div className="p-4 rounded-xl bg-[#030509]/85 border border-[#D4AF37]/20 text-sm text-[#E5ECF5] whitespace-pre-wrap leading-relaxed min-h-[160px]">
                      {activeSocialText || 'No copy returned for this channel.'}
                    </div>
                  </>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-[#D4AF37]/15 bg-[#030509]/60 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSocialModalOpen(false);
                    onNavigate('marketing');
                  }}
                  className="text-xs font-medium text-[#00D5FF] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Full Marketing Center</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSocialModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-[#C8D0DB] hover:text-white bg-[#06152E] border border-[#D4AF37]/25 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={!activeSocialText || generatingSocial}
                    onClick={() => void handleCopyActivePost()}
                    className="btn-gold px-4 py-2 text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {copiedTab === activeTab ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Post</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
