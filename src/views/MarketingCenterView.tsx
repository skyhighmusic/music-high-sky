import React, { useMemo, useState } from 'react';
import { Sparkles, Copy, Check, Link2, Download, Loader2 } from 'lucide-react';
import { BRAND_LOGO_URL, MUSIC_GENRES, MUSIC_LANGUAGES, MUSIC_MOODS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import type { MarketingKit } from '../types';

export const MarketingCenterView: React.FC = () => {
  const { releases, distributionRecords, artist, pushToast } = usePlatform();

  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customGenre, setCustomGenre] = useState(MUSIC_GENRES[0]);
  const [customLanguage, setCustomLanguage] = useState('Hindi');
  const [customMood, setCustomMood] = useState('Emotional');
  const [customType, setCustomType] = useState<'audio' | 'video'>('audio');
  const [customAngle, setCustomAngle] = useState('');

  const [generating, setGenerating] = useState(false);
  const [kit, setKit] = useState<MarketingKit | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const selectedRelease = useMemo(
    () => releases.find((r) => r.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId]
  );

  const liveLinksForSelected = useMemo(() => {
    if (!selectedRelease) return [];
    return distributionRecords.filter(
      (d) => d.releaseId === selectedRelease.id && Boolean(d.liveUrl)
    );
  }, [distributionRecords, selectedRelease]);

  const smartLinkUrl = useMemo(() => {
    const slugSource = selectedRelease?.smartLinkSlug || selectedRelease?.title || customTitle || 'sunil-kumar';
    const cleanSlug = slugSource
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${window.location.origin}/release/${cleanSlug || 'music-high-sky'}`;
  }, [selectedRelease, customTitle]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      pushToast('Copied promotional copy to clipboard.', 'success');
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      pushToast('Clipboard copy blocked by browser.', 'error');
    }
  };

  const handleGenerateKit = async () => {
    const titleToUse = selectedRelease?.title || customTitle.trim();
    if (!titleToUse) {
      pushToast('Select a catalog release or enter a song title first.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToUse,
          subtitle: selectedRelease?.subtitle || '',
          primaryArtist: selectedRelease?.primaryArtist || artist.name,
          featuredArtist: selectedRelease?.featuredArtist || '',
          releaseType: selectedRelease?.releaseType || customType,
          genre: selectedRelease?.genre || customGenre,
          subgenre: selectedRelease?.subgenre || '',
          language: selectedRelease?.language || customLanguage,
          mood: selectedRelease?.mood || customMood,
          plannedReleaseDate: selectedRelease?.plannedReleaseDate || '',
          distributorLabel: selectedRelease?.distributorLabel || 'Music High Sky',
          lyricist: selectedRelease?.lyricist || artist.name,
          composer: selectedRelease?.composer || artist.name,
          musicProducer: selectedRelease?.musicProducer || '',
          customAngle: customAngle.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'AI marketing generator returned an error.');
      }

      setKit(data.kit as MarketingKit);
      pushToast('AI promotional campaign kit generated.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to generate marketing kit.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
          Music High Sky · AI Promotion &amp; Smart Links
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
          Music Promotion &amp; Marketing Center
        </h2>
        <p className="text-sm text-[#C8D0DB] mt-1">
          Generate store-ready YouTube titles, SEO tags, hashtags, social posts, Spotify pitch copy, Smart Links, and promotional artwork kits.
        </p>
      </div>

      {/* Campaign Brief Configuration */}
      <section className="luxury-card rounded-2xl p-6 space-y-5 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Select Catalog Release</label>
            <select
              value={selectedReleaseId}
              onChange={(e) => setSelectedReleaseId(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            >
              <option value="" className="bg-[#06152E]">— Custom / Pre-submission Song —</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#06152E]">
                  {r.releaseCode} — {r.title} ({r.releaseType})
                </option>
              ))}
            </select>
          </div>

          {!selectedRelease && (
            <>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Song / Video Title</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Enter release title"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5 font-medium">Language</label>
                  <select
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value)}
                    className="w-full px-3 py-2.5 luxury-input rounded-lg"
                  >
                    {MUSIC_LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-[#06152E]">
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5 font-medium">Genre</label>
                  <select
                    value={customGenre}
                    onChange={(e) => setCustomGenre(e.target.value)}
                    className="w-full px-3 py-2.5 luxury-input rounded-lg"
                  >
                    {MUSIC_GENRES.map((g) => (
                      <option key={g} value={g} className="bg-[#06152E]">
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {!selectedRelease && (
            <>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Mood</label>
                <select
                  value={customMood}
                  onChange={(e) => setCustomMood(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  {MUSIC_MOODS.map((m) => (
                    <option key={m} value={m} className="bg-[#06152E]">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Format</label>
                <select
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value as 'audio' | 'video')}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="audio" className="bg-[#06152E]">Audio Release</option>
                  <option value="video" className="bg-[#06152E]">Official Music Video</option>
                </select>
              </div>
            </>
          )}

          <div className={selectedRelease ? 'md:col-span-2' : ''}>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Campaign Angle / Story Notes (Optional)
            </label>
            <input
              type="text"
              value={customAngle}
              onChange={(e) => setCustomAngle(e.target.value)}
              placeholder="e.g. Emotional monsoon story, Reels hook focus, Haryanvi anthem launch..."
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#D4AF37]/20">
          <p className="text-[#8D9AAA]">
            Official credits enforced:{' '}
            <strong className="text-[#F5D58A]">{selectedRelease?.artistCredit || artist.name}</strong> ·{' '}
            <strong className="text-[#00D5FF]">{selectedRelease?.labelCredit || 'Music High Sky'}</strong>
          </p>
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerateKit}
            className="btn-gold inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'Generating Promotional Kit...' : 'Generate AI Promotional Kit'}
          </button>
        </div>
      </section>

      {/* AI Generated Marketing Outputs */}
      {kit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                YouTube Title Options
              </h3>
              <button
                type="button"
                onClick={() => copyText('ytTitles', kit.youtubeTitles.join('\n'))}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'ytTitles' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy All
              </button>
            </div>
            <ul className="space-y-2">
              {kit.youtubeTitles.map((t, i) => (
                <li
                  key={i}
                  className="p-3 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20 text-white font-medium"
                >
                  {t}
                </li>
              ))}
            </ul>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                YouTube Description
              </h3>
              <button
                type="button"
                onClick={() => copyText('ytDesc', kit.youtubeDescription)}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'ytDesc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-[#C8D0DB] bg-[#030509]/75 border border-[#D4AF37]/20 rounded-xl p-3.5 max-h-56 overflow-y-auto leading-relaxed">
              {kit.youtubeDescription}
            </pre>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">SEO Tags</h3>
              <button
                type="button"
                onClick={() => copyText('seo', kit.seoTags.join(', '))}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'seo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Comma-Separated
              </button>
            </div>
            <p className="text-[#C8D0DB] bg-[#030509]/75 border border-[#D4AF37]/20 rounded-xl p-3.5 leading-relaxed">
              {kit.seoTags.join(', ')}
            </p>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                Trending Hashtags
              </h3>
              <button
                type="button"
                onClick={() => copyText('hash', kit.trendingHashtags.join(' '))}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'hash' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy All
              </button>
            </div>
            <p className="text-[#00D5FF] bg-[#030509]/75 border border-[#00A8FF]/25 rounded-xl p-3.5 leading-relaxed font-mono">
              {kit.trendingHashtags.join(' ')}
            </p>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                Instagram Captions
              </h3>
              <button
                type="button"
                onClick={() => copyText('ig', kit.instagramCaptions.join('\n\n---\n\n'))}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'ig' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <div className="space-y-2.5">
              {kit.instagramCaptions.map((cap, idx) => (
                <p
                  key={idx}
                  className="whitespace-pre-wrap text-[#C8D0DB] bg-[#030509]/75 border border-[#D4AF37]/20 rounded-xl p-3.5 leading-relaxed"
                >
                  {cap}
                </p>
              ))}
            </div>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                Facebook Promotional Post
              </h3>
              <button
                type="button"
                onClick={() => copyText('fb', kit.facebookPost)}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'fb' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <p className="whitespace-pre-wrap text-[#C8D0DB] bg-[#030509]/75 border border-[#D4AF37]/20 rounded-xl p-3.5 leading-relaxed">
              {kit.facebookPost}
            </p>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                Official Release Announcement
              </h3>
              <button
                type="button"
                onClick={() => copyText('ann', kit.releaseAnnouncement)}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'ann' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <p className="whitespace-pre-wrap text-[#C8D0DB] bg-[#030509]/75 border border-[#D4AF37]/20 rounded-xl p-3.5 leading-relaxed">
              {kit.releaseAnnouncement}
            </p>
          </section>

          <section className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                Spotify Pitch &amp; Promo Copy
              </h3>
              <button
                type="button"
                onClick={() => copyText('spot', kit.spotifyCopy)}
                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white cursor-pointer"
              >
                {copiedKey === 'spot' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <p className="whitespace-pre-wrap text-[#C8D0DB] bg-[#030509]/75 border border-[#D4AF37]/20 rounded-xl p-3.5 leading-relaxed">
              {kit.spotifyCopy}
            </p>
          </section>
        </div>
      )}

      {/* Smart Link Builder & Promotional Assets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 luxury-card rounded-2xl p-5 sm:p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-[#F5D58A]">
              <Link2 className="w-4 h-4 text-[#00D5FF]" />
              Release Smart Link Card
            </div>
            <button
              type="button"
              onClick={() => copyText('smartlink', smartLinkUrl)}
              className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer"
            >
              {copiedKey === 'smartlink' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Copy Smart Link
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/30 space-y-4">
            <div className="flex items-center gap-4">
              <img
                src={selectedRelease?.artworkPreview || BRAND_LOGO_URL}
                alt="Release Cover"
                referrerPolicy="no-referrer"
                className={`w-16 h-16 rounded-xl border border-[#D4AF37]/45 shrink-0 ${
                  selectedRelease?.artworkPreview ? 'object-cover' : 'object-contain bg-[#020817]'
                }`}
              />
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-white truncate">
                  {selectedRelease?.title || customTitle || 'Select a release'}
                </p>
                <p className="text-[#F5D58A]">
                  {selectedRelease?.artistCredit || artist.name} · Music High Sky
                </p>
                <p className="font-mono text-[11px] text-[#00D5FF] truncate mt-1">{smartLinkUrl}</p>
              </div>
            </div>

            {liveLinksForSelected.length > 0 ? (
              <div className="space-y-2 pt-3 border-t border-[#D4AF37]/20">
                {liveLinksForSelected.map((d) => (
                  <a
                    key={d.id}
                    href={d.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#06152E]/80 hover:bg-[#06152E] border border-[#D4AF37]/20 hover:border-[#00A8FF]/50 text-white transition-colors"
                  >
                    <span>{d.platformName}</span>
                    <span className="text-[#00D5FF] font-semibold">Listen</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#8D9AAA] pt-3 border-t border-[#D4AF37]/20">
                Verified DSP links added in Distribution Management will appear automatically inside this Smart Link hub.
              </p>
            )}
          </div>
        </section>

        <section className="lg:col-span-6 luxury-card rounded-2xl p-5 sm:p-6 space-y-4 text-xs">
          <h3 className="font-display text-base font-semibold text-[#F5D58A]">
            Promotional Artwork &amp; Official Brand Assets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/25 flex items-center gap-3">
              <img
                src={BRAND_LOGO_URL}
                alt="Music High Sky Official Logo"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-contain bg-[#020817] ring-1 ring-[#D4AF37]/45 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white truncate">Music High Sky Logo</p>
                <p className="text-[11px] text-[#8D9AAA]">Official Label Emblem</p>
                <a
                  href={BRAND_LOGO_URL}
                  download="Music-High-Sky-Official-Logo.png"
                  className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-[#F5D58A] mt-1 font-medium"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
              </div>
            </div>

            {releases
              .filter((r) => Boolean(r.artworkPreview))
              .slice(0, 5)
              .map((rel) => (
                <div
                  key={rel.id}
                  className="p-3.5 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20 flex items-center gap-3"
                >
                  <img
                    src={rel.artworkPreview}
                    alt={rel.title}
                    className="w-12 h-12 rounded-lg object-cover border border-[#D4AF37]/35 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">{rel.title}</p>
                    <p className="text-[11px] text-[#8D9AAA] capitalize">{rel.releaseType} art</p>
                    <button
                      type="button"
                      onClick={() =>
                        downloadDataUrl(
                          rel.artworkPreview!,
                          `${rel.releaseCode}-artwork.jpg`
                        )
                      }
                      className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-[#F5D58A] mt-1 font-medium cursor-pointer"
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
};
