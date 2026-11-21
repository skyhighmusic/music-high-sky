import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Zap,
  X,
  PlusCircle,
  Wallet,
  Megaphone,
  ArrowUpRight,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { NavSection } from '../types';

interface QuickActionsMenuProps {
  onNavigate: (section: NavSection) => void;
}

interface QuickActionItem {
  id: NavSection;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  accent: 'gold' | 'blue';
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'new-release',
    label: 'Create New Release',
    description: 'Submit an audio master or official music video',
    icon: PlusCircle,
    accent: 'gold',
  },
  {
    id: 'royalties',
    label: 'View Royalties',
    description: 'Review verified DSP statements and payouts',
    icon: Wallet,
    accent: 'blue',
  },
  {
    id: 'marketing',
    label: 'Run AI Marketing Campaign',
    description: 'Generate YouTube SEO, social copy, and press kits',
    icon: Megaphone,
    accent: 'gold',
  },
];

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({ onNavigate }) => {
  const { currentTrack } = usePlayer();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (section: NavSection) => {
    setOpen(false);
    onNavigate(section);
  };

  return (
    <div
      ref={containerRef}
      className={`fixed right-6 z-40 flex flex-col items-end gap-3 transition-all ${
        currentTrack ? 'bottom-24' : 'bottom-6'
      }`}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            id="dashboard-quick-actions-menu"
            role="menu"
            aria-label="Quick Actions"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-[min(calc(100vw-3rem),320px)] rounded-2xl luxury-card border border-[#D4AF37]/40 shadow-[0_20px_50px_-14px_rgba(0,0,0,0.88)] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#D4AF37]/20 flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-[0.12em] text-[#F5D58A]">
                Quick Actions
              </span>
              <span className="text-[11px] text-[#8D9AAA]">Direct workflow shortcuts</span>
            </div>

            <div className="p-2 divide-y divide-[#D4AF37]/10">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelect(action.id)}
                    className="w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 hover:bg-[#06152E]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8FF] transition-colors group cursor-pointer"
                  >
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                        action.accent === 'gold'
                          ? 'bg-[#D4AF37]/14 border-[#D4AF37]/35 text-[#F5D58A] group-hover:border-[#F5D58A]/70'
                          : 'bg-[#00A8FF]/14 border-[#00A8FF]/35 text-[#00D5FF] group-hover:border-[#00D5FF]/70'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-white group-hover:text-[#F5D58A] transition-colors truncate">
                        {action.label}
                      </span>
                      <span className="block text-[11px] text-[#8D9AAA] truncate mt-0.5">
                        {action.description}
                      </span>
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-[#8D9AAA] group-hover:text-[#00D5FF] shrink-0 transition-colors" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="dashboard-quick-actions-menu"
        onClick={() => setOpen((prev) => !prev)}
        className={`min-h-[46px] px-4 py-2.5 rounded-xl inline-flex items-center gap-2 text-xs font-bold tracking-[0.06em] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#020817] transition-all ${
          open
            ? 'bg-[#06152E] text-[#F5D58A] border border-[#F5D58A]/65 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.85)]'
            : 'btn-gold shadow-[0_12px_32px_-8px_rgba(212,175,55,0.55)]'
        }`}
      >
        {open ? <X className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        <span>{open ? 'Close Menu' : 'Quick Actions'}</span>
      </button>
    </div>
  );
};
