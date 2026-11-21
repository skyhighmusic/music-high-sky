import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, CloudUpload, Download, Globe2, Save, Shield, History } from 'lucide-react';
import { ROLE_LABELS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import {
  markNotificationRead,
  updatePlatformSettingsRecord,
  updateUserRoleOrStatus,
} from '../services/firestoreService';
import {
  CLOUD_STORAGE_BUCKET,
  getCloudMediaBaseUrl,
  isCloudHostedUrl,
  offloadCatalogAssetsToFirebaseStorage,
  setCloudMediaBaseUrl,
  type AssetOffloadProgress,
} from '../services/storageService';
import type { PlatformSettings, UserProfile, UserRole } from '../types';

export const NotificationsView: React.FC = () => {
  const { notifications, pushToast } = usePlatform();

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to mark read.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      await markNotificationRead(n.id);
    }
    if (unread.length > 0) {
      pushToast(`Marked ${unread.length} notification(s) as read.`, 'success');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Music High Sky · Workflow Alerts
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Notifications Center
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1">
            In-app and configurable email alert history for submissions, approvals, schedules, deliveries, and royalties.
          </p>
        </div>

        <button
          type="button"
          onClick={handleMarkAllRead}
          className="btn-electric inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap shrink-0"
        >
          <CheckCheck className="w-4 h-4" />
          Mark All Read
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="luxury-card rounded-2xl p-12 text-center space-y-2.5">
          <Bell className="w-6 h-6 text-[#D4AF37] mx-auto" />
          <p className="font-display text-base font-semibold text-[#F5D58A]">
            No Notifications Yet
          </p>
          <p className="text-xs text-[#C8D0DB]">
            Workflow events such as new submissions, release approvals, schedules, and royalty updates will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="luxury-card rounded-2xl divide-y divide-[#D4AF37]/15 overflow-hidden">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                n.read ? 'opacity-70' : 'bg-[#00A8FF]/[0.06]'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8D9AAA]">
                  <span className="font-semibold text-[#00D5FF]">{n.category}</span>
                  <span>·</span>
                  <span>
                    {n.emailDispatchEnabled ? 'In-App & Email Flagged' : 'In-App Only'}
                  </span>
                  {n.createdAt?.toDate && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{n.createdAt.toDate().toLocaleString()}</span>
                    </>
                  )}
                </div>
                <p className="text-sm font-semibold text-white">{n.title}</p>
                <p className="text-xs text-[#C8D0DB] leading-relaxed">{n.message}</p>
              </div>

              {!n.read && (
                <button
                  type="button"
                  onClick={() => handleMarkRead(n.id)}
                  className="btn-electric px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const UserManagementView: React.FC = () => {
  const { currentUser, users, auditLogs, pushToast } = usePlatform();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const handleUpdateUser = async (
    target: UserProfile,
    role: UserRole,
    status: 'active' | 'suspended'
  ) => {
    if (!currentUser || !isSuperAdmin) return;
    setBusyUid(target.uid);
    try {
      await updateUserRoleOrStatus({ targetUser: target, role, status, actor: currentUser });
      pushToast(`Updated ${target.displayName} to ${ROLE_LABELS[role]} (${status}).`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to update user.', 'error');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
          Music High Sky · Role-Based Access Control
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
          User Management &amp; Audit Trail
        </h2>
        <p className="text-sm text-[#C8D0DB] mt-1">
          Assign Super Administrator, Artist (Sunil Kumar), and Label Manager roles enforced by Cloud Firestore Security Rules.
        </p>
      </div>

      {/* Role Matrix */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="luxury-card rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-display text-base text-[#F5D58A] font-semibold">
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Super Administrator
          </div>
          <p className="text-[#C8D0DB] leading-relaxed">
            Full control: approves/rejects releases, edits Sunil Kumar&apos;s artist profile, manages users &amp; roles, imports verified royalties, verifies copyright ownership, and configures settings.
          </p>
        </div>
        <div className="luxury-card rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-display text-base text-[#F5D58A] font-semibold">
            <Shield className="w-4 h-4 text-[#00D5FF]" /> Artist — Sunil Kumar
          </div>
          <p className="text-[#C8D0DB] leading-relaxed">
            Submits new audio tracks &amp; official videos, replaces artwork pre-approval, tracks release lifecycle &amp; DSP history, views verified royalties, and generates promo kits.
          </p>
        </div>
        <div className="luxury-card rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-display text-base text-[#F5D58A] font-semibold">
            <Shield className="w-4 h-4 text-emerald-400" /> Label Manager
          </div>
          <p className="text-[#C8D0DB] leading-relaxed">
            Reviews submitted releases, requests metadata corrections, manages Release Calendar dates, and logs partner DSP distribution confirmation records.
          </p>
        </div>
      </section>

      {/* Registered Users Table */}
      <section className="luxury-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#D4AF37]/20">
          <h3 className="font-display text-base font-semibold text-[#F5D58A]">
            Authenticated Accounts
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#D4AF37]/20 bg-[#030509]/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F5D58A]">
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Assigned Role</th>
                <th className="py-3.5 px-4">Account Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4AF37]/12">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-[#06152E]/60 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                    {u.displayName}
                    {u.uid === currentUser?.uid && (
                      <span className="ml-2 text-[11px] font-normal text-[#00D5FF]">(You)</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#C8D0DB] whitespace-nowrap">
                    {u.email}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isSuperAdmin && u.uid !== currentUser?.uid ? (
                      <select
                        disabled={busyUid === u.uid}
                        value={u.role}
                        onChange={(e) =>
                          handleUpdateUser(u, e.target.value as UserRole, u.status)
                        }
                        className="px-3 py-1.5 luxury-input rounded-lg"
                      >
                        <option value="super_admin" className="bg-[#06152E]">Super Administrator</option>
                        <option value="artist" className="bg-[#06152E]">Artist — Sunil Kumar</option>
                        <option value="label_manager" className="bg-[#06152E]">Label Manager</option>
                      </select>
                    ) : (
                      <span className="text-[#F5D58A] font-medium">{ROLE_LABELS[u.role]}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isSuperAdmin && u.uid !== currentUser?.uid ? (
                      <select
                        disabled={busyUid === u.uid}
                        value={u.status}
                        onChange={(e) =>
                          handleUpdateUser(u, u.role, e.target.value as 'active' | 'suspended')
                        }
                        className="px-3 py-1.5 luxury-input rounded-lg"
                      >
                        <option value="active" className="bg-[#06152E]">Active</option>
                        <option value="suspended" className="bg-[#06152E]">Suspended</option>
                      </select>
                    ) : (
                      <span
                        className={
                          u.status === 'active'
                            ? 'text-emerald-400 font-semibold'
                            : 'text-rose-400 font-semibold'
                        }
                      >
                        {u.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Immutable Audit Log */}
      <section className="luxury-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#D4AF37]/20 flex items-center gap-2">
          <History className="w-4 h-4 text-[#00D5FF]" />
          <h3 className="font-display text-base font-semibold text-[#F5D58A]">
            Immutable Platform Audit Logs
          </h3>
        </div>
        {auditLogs.length === 0 ? (
          <p className="p-6 text-xs text-[#8D9AAA]">No audit events recorded yet.</p>
        ) : (
          <div className="divide-y divide-[#D4AF37]/12 text-xs max-h-96 overflow-y-auto">
            {auditLogs.slice(0, 30).map((log) => (
              <div key={log.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-[11px] text-[#00D5FF]">{log.action}</span>
                  <p className="text-white mt-0.5">{log.summary}</p>
                </div>
                <div className="text-[11px] text-[#8D9AAA] sm:text-right shrink-0">
                  <p className="text-[#F5D58A]">{log.actorName}</p>
                  <p className="font-mono">
                    {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : 'Just now'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    settings,
    artist,
    releases,
    audioTracks,
    videoReleases,
    artworks,
    distributionRecords,
    royalties,
    copyrightRecords,
    pushToast,
  } = usePlatform();

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [form, setForm] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [cdnBaseUrl, setCdnBaseUrl] = useState(() => getCloudMediaBaseUrl());
  const [includeAudioVideoOffload, setIncludeAudioVideoOffload] = useState(true);
  const [offloading, setOffloading] = useState(false);
  const [offloadProgress, setOffloadProgress] = useState<AssetOffloadProgress | null>(null);

  const mediaHostingSummary = useMemo(() => {
    const artworkTotal = releases.filter((r) => Boolean(r.artworkPreview)).length;
    const artworkCloud = releases.filter((r) => isCloudHostedUrl(r.artworkPreview)).length;
    const audioTotal = audioTracks.filter((t) => Boolean(t.masterSourceUrl)).length;
    const audioCloud = audioTracks.filter((t) => isCloudHostedUrl(t.masterSourceUrl)).length;
    const videoTotal = videoReleases.filter((v) => Boolean(v.masterSourceUrl)).length;
    const videoCloud = videoReleases.filter((v) => isCloudHostedUrl(v.masterSourceUrl)).length;
    return {
      artworkTotal,
      artworkCloud,
      artworkLocal: Math.max(0, artworkTotal - artworkCloud),
      audioTotal,
      audioCloud,
      audioLocal: Math.max(0, audioTotal - audioCloud),
      videoTotal,
      videoCloud,
      videoLocal: Math.max(0, videoTotal - videoCloud),
    };
  }, [releases, audioTracks, videoReleases]);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSaveCdnBase = () => {
    setCloudMediaBaseUrl(cdnBaseUrl);
    pushToast(
      cdnBaseUrl.trim()
        ? 'External Cloud Media CDN base URL saved. Refresh to load media from the configured CDN.'
        : 'Cleared custom Cloud Media CDN base URL (using default local/Firebase paths).',
      'success'
    );
  };

  const handleOffloadToFirebaseStorage = async () => {
    if (!isSuperAdmin || offloading) return;
    setOffloading(true);
    try {
      const summary = await offloadCatalogAssetsToFirebaseStorage({
        releases,
        artworks,
        audioTracks,
        videoReleases,
        includeAudioAndVideo: includeAudioVideoOffload,
        onProgress: setOffloadProgress,
      });
      if (summary.total === 0) {
        pushToast('All catalog artwork and media assets are already cloud-hosted.', 'info');
      } else if (summary.failedCount > 0 && summary.uploadedCount === 0) {
        pushToast(
          summary.lastError ||
            `Could not upload to ${CLOUD_STORAGE_BUCKET}. Ensure Firebase Storage & storage.rules are enabled.`,
          'error'
        );
      } else {
        pushToast(
          `Offloaded ${summary.uploadedCount}/${summary.total} media assets to Firebase Storage.${summary.failedCount > 0 ? ` (${summary.failedCount} skipped/failed)` : ''}`,
          summary.failedCount > 0 ? 'info' : 'success'
        );
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Cloud offload failed.', 'error');
    } finally {
      setOffloading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isSuperAdmin) return;
    setSaving(true);
    try {
      await updatePlatformSettingsRecord(form, currentUser);
      pushToast('Music High Sky platform settings saved.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportJsonBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      platform: 'Music High Sky',
      artist,
      settings,
      releases,
      distributionRecords,
      royalties,
      copyrightRecords,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `music-high-sky-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Full Music High Sky JSON catalog backup downloaded.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Music High Sky · Label Configuration
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Platform Settings &amp; Backups
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1">
            Configure standardized official credits, notification rules, payout settlement preferences, partner API readiness, and catalog backups.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportJsonBackup}
          className="btn-electric inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          Download JSON Backup
        </button>
      </div>

      <form
        onSubmit={handleSave}
        className="luxury-card rounded-2xl p-6 sm:p-7 space-y-6 text-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Official Label / Distributor Name
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={form.labelName}
              onChange={(e) => setForm({ ...form, labelName: e.target.value })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Label Operations Email
            </label>
            <input
              type="email"
              disabled={!isSuperAdmin}
              value={form.supportEmail || ''}
              onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Default Artist Credit</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={form.defaultArtistCredit}
              onChange={(e) => setForm({ ...form, defaultArtistCredit: e.target.value })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Default Label Credit</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={form.defaultLabelCredit}
              onChange={(e) => setForm({ ...form, defaultLabelCredit: e.target.value })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Standard Copyright Information Notice
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={form.defaultCopyrightNotice || ''}
              onChange={(e) => setForm({ ...form, defaultCopyrightNotice: e.target.value })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Default Royalty Currency
            </label>
            <select
              disabled={!isSuperAdmin}
              value={form.defaultCurrency}
              onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value as 'INR' | 'USD' })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            >
              <option value="INR" className="bg-[#06152E]">Indian Rupee (INR ₹)</option>
              <option value="USD" className="bg-[#06152E]">US Dollar (USD $)</option>
            </select>
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Release Reminder Window (Days Before Launch)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              disabled={!isSuperAdmin}
              value={form.reminderDaysBeforeRelease ?? 7}
              onChange={(e) =>
                setForm({ ...form, reminderDaysBeforeRelease: Number(e.target.value) || 7 })
              }
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Royalty Payout Gateway Reference
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={form.payoutGatewayLabel || ''}
              onChange={(e) => setForm({ ...form, payoutGatewayLabel: e.target.value })}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Distribution Partner Mode
            </label>
            <select
              disabled={!isSuperAdmin}
              value={form.partnerApiMode || 'Manual Partner Workflow'}
              onChange={(e) =>
                setForm({
                  ...form,
                  partnerApiMode: e.target.value as PlatformSettings['partnerApiMode'],
                })
              }
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
            >
              <option value="Manual Partner Workflow" className="bg-[#06152E]">
                Manual Partner Workflow (Verified Evidence)
              </option>
              <option value="Partner Webhook Ready" className="bg-[#06152E]">
                Authorized Partner Webhook Ready
              </option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2.5 p-3.5 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20 cursor-pointer w-full">
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={Boolean(form.emailNotificationsEnabled)}
                onChange={(e) =>
                  setForm({ ...form, emailNotificationsEnabled: e.target.checked })
                }
                className="accent-[#00A8FF]"
              />
              <span className="text-white">
                Enable email notification dispatch flags on release approvals, deliveries, and royalty statements
              </span>
            </label>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="flex justify-end pt-4 border-t border-[#D4AF37]/20">
            <button
              type="submit"
              disabled={saving}
              className="btn-gold inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Settings...' : 'Save Settings'}
            </button>
          </div>
        )}
      </form>

      {/* External Cloud Storage & Firebase Storage Asset Offload */}
      <section className="luxury-card rounded-2xl p-6 sm:p-7 space-y-5 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#D4AF37]/20 pb-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] inline-flex items-center gap-1.5">
              <CloudUpload className="w-3.5 h-3.5" />
              Cloud Media Storage &amp; Bundle Optimization
            </p>
            <h3 className="font-display text-lg font-bold text-[#F5D58A]">
              Firebase Storage Asset Offload
            </h3>
            <p className="text-[#C8D0DB] max-w-2xl">
              Offload album artwork, audio masters, and official video files from local hosting to{' '}
              <span className="font-mono text-[#00D5FF]">{CLOUD_STORAGE_BUCKET || 'Firebase Storage'}</span>{' '}
              or an external CDN so production deployments stay lightweight.
            </p>
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              disabled={offloading}
              onClick={handleOffloadToFirebaseStorage}
              className="btn-gold inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <CloudUpload className="w-4 h-4" />
              {offloading ? 'Offloading Assets...' : 'Offload Local Assets to Firebase Storage'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20">
            <p className="text-[11px] uppercase tracking-wider text-[#8D9AAA]">Album Artwork</p>
            <p className="font-display text-xl font-bold text-white mt-1">
              {mediaHostingSummary.artworkCloud}{' '}
              <span className="text-xs font-normal text-[#8D9AAA]">
                / {mediaHostingSummary.artworkTotal} cloud
              </span>
            </p>
            <p className="text-[11px] text-[#00D5FF] mt-0.5">
              {mediaHostingSummary.artworkLocal} local-bundled remaining
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20">
            <p className="text-[11px] uppercase tracking-wider text-[#8D9AAA]">Audio Masters</p>
            <p className="font-display text-xl font-bold text-white mt-1">
              {mediaHostingSummary.audioCloud}{' '}
              <span className="text-xs font-normal text-[#8D9AAA]">
                / {mediaHostingSummary.audioTotal} cloud
              </span>
            </p>
            <p className="text-[11px] text-[#00D5FF] mt-0.5">
              {mediaHostingSummary.audioLocal} local-bundled remaining
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20">
            <p className="text-[11px] uppercase tracking-wider text-[#8D9AAA]">Video Releases</p>
            <p className="font-display text-xl font-bold text-white mt-1">
              {mediaHostingSummary.videoCloud}{' '}
              <span className="text-xs font-normal text-[#8D9AAA]">
                / {mediaHostingSummary.videoTotal} cloud
              </span>
            </p>
            <p className="text-[11px] text-[#00D5FF] mt-0.5">
              {mediaHostingSummary.videoLocal} local-bundled remaining
            </p>
          </div>
        </div>

        {isSuperAdmin && (
          <label className="inline-flex items-center gap-2.5 text-[#C8D0DB] cursor-pointer">
            <input
              type="checkbox"
              checked={includeAudioVideoOffload}
              onChange={(e) => setIncludeAudioVideoOffload(e.target.checked)}
              className="accent-[#00A8FF]"
            />
            <span>
              Include audio master &amp; video files in Firebase Storage migration (unchecked = artwork only)
            </span>
          </label>
        )}

        {offloadProgress && (
          <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#00A8FF]/30 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#00D5FF] font-medium truncate">{offloadProgress.currentLabel}</span>
              <span className="font-mono text-[#F5D58A]">
                {offloadProgress.completed} / {offloadProgress.total}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#06152E] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00A8FF] to-[#F5D58A] transition-all duration-200"
                style={{
                  width: `${
                    offloadProgress.total > 0
                      ? Math.round((offloadProgress.completed / offloadProgress.total) * 100)
                      : 100
                  }%`,
                }}
              />
            </div>
            {offloadProgress.lastError && (
              <p className="text-[11px] text-amber-300 leading-relaxed">{offloadProgress.lastError}</p>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-[#D4AF37]/15 space-y-2">
          <label className="block text-[#C8D0DB] font-medium inline-flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5 text-[#00D5FF]" />
            Optional External CDN / Cloud Storage Base URL (Overrides Local /assets/ Paths)
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="url"
              placeholder="https://storage.googleapis.com/your-music-high-sky-bucket"
              value={cdnBaseUrl}
              onChange={(e) => setCdnBaseUrl(e.target.value)}
              className="flex-1 px-3.5 py-2.5 luxury-input rounded-lg font-mono"
            />
            <button
              type="button"
              onClick={handleSaveCdnBase}
              className="btn-electric px-4 py-2.5 rounded-xl font-semibold cursor-pointer whitespace-nowrap"
            >
              Apply CDN Base URL
            </button>
          </div>
          <p className="text-[11px] text-[#8D9AAA]">
            Or set <span className="font-mono text-[#C8D0DB]">VITE_CLOUD_MEDIA_BASE_URL</span> at build time and deploy <span className="font-mono text-[#C8D0DB]">storage.rules</span> to your Firebase Storage bucket.
          </p>
        </div>
      </section>
    </div>
  );
};
