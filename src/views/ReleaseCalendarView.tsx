import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarClock, BellRing, CheckCircle2 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import {
  dispatchNotification,
  updateReleaseStatusAndReview,
} from '../services/firestoreService';

export const ReleaseCalendarView: React.FC = () => {
  const { currentUser, releases, settings, pushToast } = usePlatform();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetTime, setTargetTime] = useState('00:00');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const isStaff = currentUser?.role === 'super_admin' || currentUser?.role === 'label_manager';

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const daysGrid = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: { dateStr: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ dateStr: `${year}-${mm}-${dd}`, dayNum: d });
    }
    return cells;
  }, [year, month]);

  const releasesByDate = useMemo(() => {
    const map: Record<string, typeof releases> = {};
    for (const r of releases) {
      if (r.plannedReleaseDate) {
        if (!map[r.plannedReleaseDate]) map[r.plannedReleaseDate] = [];
        map[r.plannedReleaseDate].push(r);
      }
    }
    return map;
  }, [releases]);

  const upcomingReleases = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return releases
      .filter((r) => r.plannedReleaseDate && r.plannedReleaseDate >= todayIso && r.status !== 'Taken Down' && r.status !== 'Rejected')
      .sort((a, b) => (a.plannedReleaseDate || '').localeCompare(b.plannedReleaseDate || ''));
  }, [releases]);

  const daysUntil = (isoDate: string): number => {
    const target = new Date(`${isoDate}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleScheduleRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isStaff) return;
    const rel = releases.find((r) => r.id === selectedReleaseId);
    if (!rel || !targetDate) {
      pushToast('Select a release and target date to schedule.', 'error');
      return;
    }

    const sameDayConflict = releases.find(
      (r) => r.id !== rel.id && r.plannedReleaseDate === targetDate && r.releaseType === rel.releaseType
    );
    if (sameDayConflict) {
      pushToast(
        `Heads up: "${sameDayConflict.title}" is also scheduled on ${targetDate}. Proceeding with schedule update.`,
        'info'
      );
    }

    setSavingSchedule(true);
    try {
      await updateReleaseStatusAndReview({
        release: rel,
        newStatus: 'Scheduled',
        plannedReleaseDate: targetDate,
        releaseTime: targetTime,
        reviewNotes: `Scheduled for ${targetDate} at ${targetTime} via Release Calendar.`,
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast(`"${rel.title}" scheduled for ${targetDate} (${targetTime}).`, 'success');
      setSelectedReleaseId('');
      setTargetDate('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to schedule release.', 'error');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSendReminder = async (relTitle: string, relDate: string, relId: string) => {
    if (!currentUser) return;
    try {
      await dispatchNotification({
        recipientRole: 'all',
        category: 'Release Scheduled',
        title: `Release Reminder: ${relTitle}`,
        message: `Scheduled release date is ${relDate} (${daysUntil(relDate)} day(s) remaining). Confirm partner delivery & marketing kit readiness.`,
        releaseId: relId,
        emailDispatchEnabled: Boolean(settings.emailNotificationsEnabled),
        actorUid: currentUser.uid,
      });
      pushToast(`Reminder notification dispatched for "${relTitle}".`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Reminder dispatch failed.', 'error');
    }
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Music High Sky · Release Scheduler
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Release Calendar &amp; Countdowns
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1">
            Plan audio and official music video launch dates, prevent scheduling overlaps, and dispatch launch reminders.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="p-2.5 luxury-card hover:border-[#F5D58A]/50 text-[#F5D58A] rounded-xl cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 py-2.5 text-xs font-display font-semibold text-[#F5D58A] luxury-card rounded-xl min-w-[164px] text-center tracking-wide">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="p-2.5 luxury-card hover:border-[#F5D58A]/50 text-[#F5D58A] rounded-xl cursor-pointer transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Monthly Calendar Grid */}
        <section className="xl:col-span-8 luxury-card rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#D4AF37]/25 bg-[#030509]/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F5D58A]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-3 px-2 text-center">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-[#D4AF37]/12">
            {daysGrid.map((cell, idx) => {
              const dayItems = cell.dateStr ? releasesByDate[cell.dateStr] || [] : [];
              return (
                <div
                  key={idx}
                  className={`min-h-[96px] p-2 ${
                    cell.dayNum ? 'bg-[#06152E]/35' : 'bg-[#020817]/75'
                  }`}
                >
                  {cell.dayNum && (
                    <>
                      <span className="text-[11px] font-mono tabular-nums text-[#8D9AAA]">
                        {cell.dayNum}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayItems.map((rel) => (
                          <div
                            key={rel.id}
                            title={`${rel.title} (${rel.status})`}
                            className={`px-1.5 py-1 rounded text-[10px] font-medium truncate ${
                              rel.releaseType === 'audio'
                                ? 'bg-[#00A8FF]/18 text-[#00D5FF] border border-[#00A8FF]/40'
                                : 'bg-[#D4AF37]/18 text-[#F5D58A] border border-[#D4AF37]/40'
                            }`}
                          >
                            {rel.title}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Schedule Form & Upcoming Countdowns */}
        <div className="xl:col-span-4 space-y-6">
          {isStaff && (
            <form
              onSubmit={handleScheduleRelease}
              className="luxury-card rounded-2xl p-5 space-y-4 text-xs"
            >
              <div className="flex items-center gap-2 font-display text-[#F5D58A] font-semibold text-base pb-3 border-b border-[#D4AF37]/20">
                <CalendarClock className="w-4 h-4 text-[#00D5FF]" />
                Schedule a Release
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Select Release</label>
                <select
                  value={selectedReleaseId}
                  onChange={(e) => setSelectedReleaseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="" className="bg-[#06152E]">Choose release...</option>
                  {releases
                    .filter((r) => r.status !== 'Taken Down')
                    .map((r) => (
                      <option key={r.id} value={r.id} className="bg-[#06152E]">
                        {r.releaseCode} — {r.title} ({r.status})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Release Date</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2.5 luxury-input rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Release Time</label>
                  <input
                    type="time"
                    value={targetTime}
                    onChange={(e) => setTargetTime(e.target.value)}
                    className="w-full px-3 py-2.5 luxury-input rounded-lg font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingSchedule}
                className="btn-gold w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {savingSchedule ? 'Scheduling...' : 'Confirm Release Schedule'}
              </button>
            </form>
          )}

          {/* Upcoming Countdown List */}
          <section className="luxury-card rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-[#F5D58A] pb-3 border-b border-[#D4AF37]/20">
              Upcoming Release Countdowns
            </h3>
            {upcomingReleases.length === 0 ? (
              <p className="text-xs text-[#8D9AAA] leading-relaxed">
                No upcoming release dates scheduled yet. Assign a planned release date when submitting or via the scheduler panel.
              </p>
            ) : (
              <div className="divide-y divide-[#D4AF37]/15">
                {upcomingReleases.slice(0, 6).map((rel) => {
                  const left = daysUntil(rel.plannedReleaseDate!);
                  return (
                    <div key={rel.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{rel.title}</p>
                        <p className="text-[11px] font-mono text-[#8D9AAA]">
                          {rel.plannedReleaseDate} {rel.releaseTime || ''} · {rel.releaseType}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums font-bold text-[#F5D58A]">
                          {left === 0 ? 'Today' : `${left}d`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleSendReminder(rel.title, rel.plannedReleaseDate!, rel.id)
                          }
                          title="Send release reminder notification"
                          className="btn-electric p-1.5 rounded-lg cursor-pointer"
                        >
                          <BellRing className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
