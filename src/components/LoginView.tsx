import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, Disc3, Film, BarChart3 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

const SPLASH_WAVE_BARS = [
  18, 34, 28, 52, 74, 48, 86, 64, 96, 72, 46, 82, 100, 68, 44, 78, 92, 58, 40, 70, 88, 52, 36,
  62, 42, 26, 38, 22,
];

export const LoginView: React.FC = () => {
  const { signInGoogle, brandLogoUrl, artistPhotoUrl } = usePlatform();
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white relative overflow-hidden flex flex-col justify-between">
      {/* Subtle Cinematic Midnight Navy, Electric Blue & Metallic Gold Illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(7,89,199,0.22)_0%,_rgba(2,8,23,0.92)_55%,_#030509_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-1/4 left-1/2 -translate-x-1/2 w-[540px] h-[540px] rounded-full bg-[#00A8FF]/10 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[18%] left-1/2 -translate-x-1/2 w-[320px] h-[320px] rounded-full bg-[#D4AF37]/10 blur-[100px]"
      />

      {/* Centered Cinematic Opening Experience */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl flex flex-col items-center text-center"
        >
          {/* Prominent Unmodified Original Music High Sky Circular Logo */}
          <div className="relative mb-6">
            <div
              aria-hidden="true"
              className="absolute -inset-3 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,rgba(0,168,255,0.4)_0deg,rgba(212,175,55,0.55)_140deg,rgba(0,213,255,0.35)_260deg,rgba(245,213,138,0.45)_360deg)] blur-md opacity-75"
            />
            <div className="relative p-1.5 rounded-full bg-gradient-to-br from-[#F5D58A]/70 via-[#06152E] to-[#00A8FF]/60 shadow-2xl">
              <img
                src={brandLogoUrl}
                alt="Music High Sky Official Logo — Sunil Kumar Official Music"
                referrerPolicy="no-referrer"
                className="w-40 h-40 sm:w-48 sm:h-48 rounded-full object-contain bg-[#030509]"
              />
            </div>
          </div>

          {/* Animated Electric Blue Audio Waveform Below Logo */}
          <div
            aria-hidden="true"
            className="flex items-end justify-center gap-[3px] h-9 w-64 sm:w-72 mb-7"
          >
            {SPLASH_WAVE_BARS.map((h, i) => (
              <span
                key={i}
                style={{
                  height: `${h}%`,
                  animationDelay: `${(i % 9) * 0.14}s`,
                }}
                className="flex-1 rounded-full bg-gradient-to-t from-[#0759C7] via-[#00A8FF] to-[#00D5FF] animate-wave-bar"
              />
            ))}
          </div>

          {/* Brand Display Typography */}
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-[0.14em] text-gold-gradient">
            MUSIC HIGH SKY
          </h1>
          <p className="mt-3 text-xs sm:text-sm font-semibold tracking-[0.22em] text-[#C8D0DB]">
            OFFICIAL MUSIC DISTRIBUTION &amp; ARTIST MANAGEMENT
          </p>
          <p className="mt-2.5 text-sm sm:text-base text-[#8D9AAA] italic">
            Powered by Music. Driven by Excellence.
          </p>

          <div className="gold-divider w-56 my-7" />

          {/* Luxury Glass Sign-In Panel */}
          <div className="w-full max-w-md luxury-card rounded-2xl p-6 sm:p-7 space-y-6 text-left">
            <div className="flex items-center gap-4 pb-5 border-b border-[#D4AF37]/20">
              <img
                src={artistPhotoUrl}
                alt="Sunil Kumar — Featured Independent Artist"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover object-top ring-2 ring-[#D4AF37]/60 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold tracking-wider text-[#00D5FF]">
                  Featured Official Artist
                </p>
                <div className="flex items-baseline gap-2.5">
                  <p className="text-base font-bold text-white truncate">Sunil Kumar</p>
                  <span className="font-script text-xl text-[#F5D58A] leading-none">
                    Sunil Kumar
                  </span>
                </div>
                <p className="text-xs text-[#8D9AAA] truncate">
                  Musician · Singer · Lyricist · Worldwide Distribution
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={signingIn}
                className="w-full btn-gold py-3.5 px-6 rounded-xl text-sm tracking-wide flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <span>{signingIn ? 'Authenticating Label Access...' : 'Sign In to Music High Sky'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-2.5 text-xs text-[#8D9AAA] leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-[#00A8FF] shrink-0 mt-0.5" />
                <span>
                  Secured via Firebase Authentication &amp; Role-Based Access Control for Super
                  Administrator, Artist (Sunil Kumar), and Label Manager workspaces.
                </span>
              </div>
            </div>
          </div>

          {/* Restrained Platform Capabilities Strip */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-2xl text-left">
            <div className="p-4 rounded-xl bg-[#06152E]/50 border border-[#D4AF37]/15">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5D58A] mb-1">
                <Disc3 className="w-4 h-4 text-[#00A8FF]" />
                Studio Audio Masters
              </div>
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                WAV/FLAC/MP3 waveform analysis, cover artwork verification, and global DSP tracking.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#06152E]/50 border border-[#D4AF37]/15">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5D58A] mb-1">
                <Film className="w-4 h-4 text-[#00A8FF]" />
                Official Music Videos
              </div>
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                Cinema-grade MP4/MOV review, thumbnail checks, and YouTube / Meta distribution logs.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#06152E]/50 border border-[#D4AF37]/15">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5D58A] mb-1">
                <BarChart3 className="w-4 h-4 text-[#00A8FF]" />
                Verified Royalties
              </div>
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                Authentic CSV statement analytics, ISRC/UPC rights registry, and branded PDF reports.
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 py-4 px-6 text-center text-[11px] text-[#8D9AAA] border-t border-[#D4AF37]/15">
        © {new Date().getFullYear()} Music High Sky · Official Distributor Label for Sunil Kumar ·
        India &amp; Worldwide
      </footer>
    </div>
  );
};
