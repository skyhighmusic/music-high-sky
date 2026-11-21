import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CloudDownload,
  FolderSearch,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Music,
  Film,
  Image as ImageIcon,
  UserCheck,
  ShieldCheck,
  RotateCcw,
  Trash2,
  HardDrive,
} from 'lucide-react';
import {
  authorizeGoogleDriveReadOnly,
  clearDriveAccessToken,
  hasActiveDriveAccessToken,
  subscribeDriveConnection,
} from '../firebase';
import {
  executeGoogleDriveImport,
  inspectOfficialGoogleDriveSources,
  OFFICIAL_GOOGLE_DRIVE_SOURCES,
  type DriveImportProgress,
  type DriveInspectionSummary,
} from '../services/googleDriveService';
import { cleanupSampleDemoRecords } from '../services/firestoreService';
import { CLOUD_STORAGE_BUCKET } from '../services/storageService';
import { usePlatform } from '../context/PlatformContext';
import { formatBytes } from '../utils/mediaValidation';
import type { ImportFileLogEntry } from '../types';

export const ImportManagementView: React.FC = () => {
  const {
    currentUser,
    mediaAssets,
    importJobs,
    resyncOfficialPlaylists,
    pushToast,
  } = usePlatform();

  const [driveConnected, setDriveConnected] = useState(hasActiveDriveAccessToken());
  const [connecting, setConnecting] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const [inspection, setInspection] = useState<DriveInspectionSummary | null>(null);
  const [liveProgress, setLiveProgress] = useState<DriveImportProgress | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const isStaff = currentUser?.role === 'super_admin' || currentUser?.role === 'label_manager';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  useEffect(() => {
    setDriveConnected(hasActiveDriveAccessToken());
    return subscribeDriveConnection(setDriveConnected);
  }, []);

  const handleConnectDrive = async () => {
    setConnecting(true);
    try {
      await authorizeGoogleDriveReadOnly();
      setDriveConnected(true);
      pushToast(
        'Connected to Google Drive with read-only permission (in-memory session token).',
        'success'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Unable to authorize Google Drive access.',
        'error'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleInspectSources = async () => {
    setInspecting(true);
    try {
      let token: string | undefined;
      if (!hasActiveDriveAccessToken()) {
        token = await authorizeGoogleDriveReadOnly();
      }
      const summary = await inspectOfficialGoogleDriveSources(token);
      setInspection(summary);
      if (summary.sourceErrors.length > 0) {
        pushToast(
          `Inspected ${summary.counts.totalDiscovered} files; ${summary.sourceErrors.length} source(s) returned access errors.`,
          'info'
        );
      } else {
        pushToast(
          `Discovered ${summary.counts.totalDiscovered} files across all 3 Google Drive sources.`,
          'success'
        );
      }
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Google Drive inspection failed.',
        'error'
      );
    } finally {
      setInspecting(false);
    }
  };

  const handleRunImport = async (retryOnlyIds?: Set<string>) => {
    if (!currentUser || !isStaff) {
      pushToast('Administrator or Label Manager permissions are required to import media.', 'error');
      return;
    }

    setImporting(true);
    try {
      let token: string | undefined;
      if (!hasActiveDriveAccessToken()) {
        token = await authorizeGoogleDriveReadOnly();
      }
      let currentInspection = inspection;
      if (!currentInspection) {
        currentInspection = await inspectOfficialGoogleDriveSources(token);
        setInspection(currentInspection);
      }

      if (currentInspection.items.length === 0) {
        pushToast(
          'No accessible files were found in the linked Google Drive sources. Check source permissions.',
          'info'
        );
        return;
      }

      const { jobId, progress } = await executeGoogleDriveImport({
        items: currentInspection.items,
        actor: currentUser,
        accessToken: token,
        onlyFileIds: retryOnlyIds,
        onProgress: (p) => setLiveProgress(p),
      });

      setSelectedJobId(jobId);
      await resyncOfficialPlaylists();

      pushToast(
        `Import finished: ${progress.importedCount} imported, ${progress.duplicateCount} duplicates skipped, ${progress.failedCount} failed.`,
        progress.failedCount > 0 ? 'info' : 'success'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Google Drive import failed.',
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleCleanupSamples = async () => {
    if (!currentUser || !isSuperAdmin) return;
    setCleaning(true);
    try {
      const res = await cleanupSampleDemoRecords(currentUser);
      pushToast(
        res.removedCount > 0
          ? `Removed ${res.removedCount} sample/demo placeholder record(s); preserved ${res.preservedCount} genuine releases.`
          : `No sample/demo placeholder records found. All ${res.preservedCount} verified releases preserved.`,
        'success'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Sample data cleanup failed.',
        'error'
      );
    } finally {
      setCleaning(false);
    }
  };

  const activeJob = useMemo(() => {
    if (selectedJobId) {
      return importJobs.find((j) => j.id === selectedJobId) || importJobs[0] || null;
    }
    return importJobs[0] || null;
  }, [importJobs, selectedJobId]);

  const activeLogs: ImportFileLogEntry[] = useMemo(() => {
    if (liveProgress && liveProgress.logs.length > 0) {
      return liveProgress.logs;
    }
    if (!activeJob?.logsJson) return [];
    try {
      return JSON.parse(activeJob.logsJson) as ImportFileLogEntry[];
    } catch {
      return [];
    }
  }, [liveProgress, activeJob]);

  const failedFileIds = useMemo(
    () => new Set(activeLogs.filter((l) => l.status === 'failed').map((l) => l.fileId)),
    [activeLogs]
  );

  const metrics = useMemo(() => {
    if (liveProgress) {
      return {
        totalDiscovered: inspection?.counts.totalDiscovered ?? liveProgress.totalItems,
        audioCount: inspection?.counts.audioCount ?? 0,
        videoCount: inspection?.counts.videoCount ?? 0,
        artworkCount: inspection?.counts.artworkCount ?? 0,
        artistImageCount:
          (inspection?.counts.artistImageCount ?? 0) + (inspection?.counts.brandingCount ?? 0),
        importedCount: liveProgress.importedCount,
        duplicateCount: liveProgress.duplicateCount,
        failedCount: liveProgress.failedCount,
        pendingVerificationCount: liveProgress.pendingVerificationCount,
      };
    }
    if (activeJob) {
      return {
        totalDiscovered: activeJob.totalDiscovered,
        audioCount: activeJob.audioCount,
        videoCount: activeJob.videoCount,
        artworkCount: activeJob.artworkCount,
        artistImageCount: activeJob.artistImageCount + activeJob.brandingCount,
        importedCount: activeJob.importedCount,
        duplicateCount: activeJob.duplicateCount,
        failedCount: activeJob.failedCount,
        pendingVerificationCount: activeJob.pendingVerificationCount,
      };
    }
    return {
      totalDiscovered: inspection?.counts.totalDiscovered ?? 0,
      audioCount: inspection?.counts.audioCount ?? 0,
      videoCount: inspection?.counts.videoCount ?? 0,
      artworkCount: inspection?.counts.artworkCount ?? 0,
      artistImageCount:
        (inspection?.counts.artistImageCount ?? 0) + (inspection?.counts.brandingCount ?? 0),
      importedCount: mediaAssets.length,
      duplicateCount: 0,
      failedCount: 0,
      pendingVerificationCount: mediaAssets.filter(
        (a) => a.metadataStatus === 'pending_verification'
      ).length,
    };
  }, [liveProgress, activeJob, inspection, mediaAssets]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[#00D5FF] mb-1">
            ADMIN IMPORT MANAGEMENT · GOOGLE DRIVE TO FIREBASE STORAGE
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Google Drive Media Import &amp; Storage Registry
          </h2>
          <p className="text-sm text-[#8D9AAA] mt-1">
            Inspect and transfer your official Music High Sky logo, Sunil Kumar portrait, audio songs, video songs, and album artwork from Google Drive into Firebase Storage ({CLOUD_STORAGE_BUCKET}) without modifying original Drive files.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {driveConnected ? (
            <button
              type="button"
              onClick={() => {
                clearDriveAccessToken();
                pushToast('Disconnected Google Drive in-memory session.', 'info');
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-950/50 border border-emerald-400/40 text-emerald-300 text-xs font-semibold cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Google Drive Connected (Disconnect)
            </button>
          ) : (
            <button
              type="button"
              disabled={connecting}
              onClick={handleConnectDrive}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-white text-[#1f1f1f] hover:bg-neutral-100 text-xs font-semibold shadow-md cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                />
                <path
                  fill="#34A853"
                  d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>{connecting ? 'Connecting Google Drive...' : 'Sign in with Google Drive'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Configured 3 Official Google Drive Sources */}
      <section className="luxury-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#F5D58A]">
              Official Google Drive Source Links (Read-Only)
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-0.5">
              Access tokens remain strictly in browser memory. Original Google Drive files are never edited or deleted.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={inspecting || importing}
              onClick={handleInspectSources}
              className="btn-electric inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
            >
              <FolderSearch className={`w-4 h-4 ${inspecting ? 'animate-pulse' : ''}`} />
              {inspecting ? 'Inspecting Drive...' : '1. Inspect Drive Sources'}
            </button>
            {isStaff && (
              <button
                type="button"
                disabled={importing || inspecting}
                onClick={() => void handleRunImport()}
                className="btn-gold inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
              >
                <CloudDownload className="w-4 h-4" />
                {importing ? 'Importing to Firebase...' : '2. Import to Firebase Storage'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {OFFICIAL_GOOGLE_DRIVE_SOURCES.map((src) => {
            const srcErr = inspection?.sourceErrors.find((e) => e.sourceId === src.id);
            return (
              <div
                key={src.id}
                className={`p-4 rounded-xl bg-[#030509]/80 border space-y-2 ${
                  srcErr ? 'border-rose-500/45' : 'border-[#D4AF37]/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F5D58A]">{src.label}</span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#00D5FF] hover:text-white"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-[11px] text-[#8D9AAA] leading-relaxed">{src.description}</p>
                <p className="text-[10px] font-mono text-[#C8D0DB] truncate">ID: {src.id}</p>
                {srcErr && (
                  <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/35 text-[11px] text-rose-200 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{srcErr.message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Transfer Progress Banner */}
        {liveProgress && importing && (
          <div className="p-4 rounded-xl bg-[#06152E] border border-[#00A8FF]/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#00D5FF] font-semibold">
                Transferring {liveProgress.currentIndex} of {liveProgress.totalItems}:{' '}
                <span className="text-white">{liveProgress.currentFileName}</span>
              </span>
              <span className="font-mono text-[#F5D58A]">
                {liveProgress.totalItems > 0
                  ? Math.round((liveProgress.currentIndex / liveProgress.totalItems) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#020817] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#0759C7] via-[#00A8FF] to-[#F5D58A] transition-all duration-300"
                style={{
                  width: `${
                    liveProgress.totalItems > 0
                      ? Math.round((liveProgress.currentIndex / liveProgress.totalItems) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Metrics Grid */}
      <section aria-label="Import Metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: 'Total Discovered', value: metrics.totalDiscovered, color: 'text-white' },
          { label: 'Audio Songs (MP3/WAV/FLAC)', value: metrics.audioCount, color: 'text-[#00D5FF]' },
          { label: 'Video Songs (MP4/MOV)', value: metrics.videoCount, color: 'text-[#00D5FF]' },
          { label: 'Album Artwork', value: metrics.artworkCount, color: 'text-[#F5D58A]' },
          { label: 'Artist & Brand Assets', value: metrics.artistImageCount, color: 'text-[#F5D58A]' },
          { label: 'Successfully Imported', value: metrics.importedCount, color: 'text-emerald-400' },
          { label: 'Duplicates Skipped', value: metrics.duplicateCount, color: 'text-[#C8D0DB]' },
          { label: 'Failed Imports', value: metrics.failedCount, color: 'text-rose-400' },
          { label: 'Pending Verification', value: metrics.pendingVerificationCount, color: 'text-amber-300' },
          { label: 'Firebase Media Assets', value: mediaAssets.length, color: 'text-[#F5D58A]' },
        ].map((card) => (
          <div
            key={card.label}
            className="luxury-card rounded-xl p-4 flex flex-col justify-between gap-2"
          >
            <span className="text-[11px] text-[#8D9AAA]">{card.label}</span>
            <span className={`text-2xl font-bold font-mono tabular-nums ${card.color}`}>
              {card.value}
            </span>
          </div>
        ))}
      </section>

      {/* Discovered Pre-Import Preview (after Inspect) */}
      {inspection && inspection.items.length > 0 && (
        <section className="luxury-card rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-[#D4AF37]/20 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#F5D58A]">
                Discovered Google Drive Files ({inspection.items.length})
              </h3>
              <p className="text-xs text-[#8D9AAA]">
                Classified by actual MIME type, file extension, and source path prior to Firebase Storage upload.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#030509] border-b border-[#D4AF37]/20 text-[11px] text-[#F5D58A]">
                <tr>
                  <th className="py-2.5 px-4">Original File Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">MIME / Format</th>
                  <th className="py-2.5 px-4">Size</th>
                  <th className="py-2.5 px-4">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4AF37]/10">
                {inspection.items.map((item) => (
                  <tr key={item.file.id} className="hover:bg-[#06152E]/55">
                    <td className="py-2.5 px-4 font-medium text-white">{item.file.name}</td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-[#00D5FF] font-mono text-[11px]">
                        {item.category === 'audio_song' && <Music className="w-3.5 h-3.5" />}
                        {item.category === 'video_song' && <Film className="w-3.5 h-3.5" />}
                        {item.category === 'album_artwork' && <ImageIcon className="w-3.5 h-3.5" />}
                        {item.category === 'artist_photo' && <UserCheck className="w-3.5 h-3.5" />}
                        {item.category === 'branding_logo' && <ShieldCheck className="w-3.5 h-3.5" />}
                        {item.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#C8D0DB]">
                      {item.extension || item.file.mimeType}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#8D9AAA]">
                      {item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-[#8D9AAA] truncate max-w-[220px]">
                      {item.folderPath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Detailed Import Execution Log & Retry Failed */}
      <section className="luxury-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#D4AF37]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#F5D58A]">
              Detailed Import Log &amp; Firebase Storage References
            </h3>
            <p className="text-xs text-[#8D9AAA]">
              File-level audit trail including Firebase Storage path, status, and error diagnostics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {importJobs.length > 1 && (
              <select
                value={activeJob?.id || ''}
                onChange={(e) => {
                  setLiveProgress(null);
                  setSelectedJobId(e.target.value);
                }}
                className="px-3 py-2 text-xs luxury-input rounded-lg"
              >
                {importJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    Job {job.id.slice(0, 14)} · {job.importedCount} imported / {job.failedCount} failed
                  </option>
                ))}
              </select>
            )}

            {isStaff && failedFileIds.size > 0 && (
              <button
                type="button"
                disabled={importing}
                onClick={() => void handleRunImport(failedFileIds)}
                className="btn-gold inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Failed ({failedFileIds.size})
              </button>
            )}
          </div>
        </div>

        {activeLogs.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#8D9AAA]">
            No import log entries yet. Click <strong className="text-white">Inspect Drive Sources</strong> and{' '}
            <strong className="text-[#F5D58A]">Import to Firebase Storage</strong> above to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#030509]/70 border-b border-[#D4AF37]/20 text-[11px] text-[#F5D58A]">
                <tr>
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Firebase Storage Ref</th>
                  <th className="py-3 px-4">Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4AF37]/10">
                {activeLogs.map((log, i) => (
                  <tr key={`${log.fileId}-${i}`} className="hover:bg-[#06152E]/50">
                    <td className="py-3 px-4 font-medium text-white">{log.fileName}</td>
                    <td className="py-3 px-4 text-[#8D9AAA]">{log.sourceLabel}</td>
                    <td className="py-3 px-4 font-mono text-[#00D5FF]">{log.category}</td>
                    <td className="py-3 px-4 font-semibold">
                      <span
                        className={
                          log.status === 'imported'
                            ? 'text-emerald-400'
                            : log.status === 'pending_verification'
                              ? 'text-[#F5D58A]'
                              : log.status === 'duplicate'
                                ? 'text-[#8D9AAA]'
                                : 'text-rose-400'
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#C8D0DB] max-w-[260px] truncate">
                      {log.storagePath ? (
                        log.downloadUrl ? (
                          <a
                            href={log.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#00D5FF] hover:underline"
                          >
                            {log.storagePath}
                          </a>
                        ) : (
                          log.storagePath
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-rose-300 max-w-[240px]">
                      {log.errorDetails || (log.status === 'pending_verification' ? 'Missing metadata flagged for admin review' : 'OK')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Safe Sample/Demo Cleanup & Firebase Storage Hierarchy Reference */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="luxury-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-[#F5D58A]">
            <HardDrive className="w-4 h-4 text-[#00D5FF]" />
            <h3 className="font-display text-sm font-bold">
              Firebase Storage Structured Hierarchy
            </h3>
          </div>
          <pre className="p-3.5 rounded-xl bg-[#030509] border border-[#D4AF37]/20 text-[11px] font-mono text-[#C8D0DB] overflow-x-auto leading-relaxed">
{`/music-high-sky/
  /branding/music-high-sky-logo.png
  /artists/sunil-kumar/profile-photo.jpg
  /audio/sunil-kumar/song-files/<original-audio>
  /videos/sunil-kumar/video-files/<original-video>
  /artwork/sunil-kumar/album-covers/<original-artwork>
  /playlists/sunil-kumar/playlist-covers/<playlist-cover>`}
          </pre>
        </div>

        <div className="luxury-card rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold text-[#F5D58A]">
              Safe Sample &amp; Demo Record Cleanup
            </h3>
            <p className="text-xs text-[#8D9AAA] leading-relaxed">
              Scans Firestore for unmistakable dummy/placeholder release records and removes only verified demo entries. All genuine Sunil Kumar songs, imported Google Drive files, album artwork, artist photos, and Firestore collections are strictly preserved.
            </p>
          </div>
          <div>
            <button
              type="button"
              disabled={!isSuperAdmin || cleaning}
              onClick={handleCleanupSamples}
              className="btn-electric inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg disabled:opacity-45 cursor-pointer"
            >
              {cleaning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {cleaning ? 'Scanning Catalog...' : 'Run Safe Sample Data Cleanup'}
            </button>
          </div>
        </div>
      </section>
    </motion.div>
  );
};
