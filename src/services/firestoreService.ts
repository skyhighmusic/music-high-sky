import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AnalyticsRecord,
  ArtistProfile,
  ArtworkRecord,
  AudioTrackRecord,
  CopyrightRecord,
  DistributionRecord,
  DistributionStatus,
  NotificationCategory,
  PlatformSettings,
  ReleaseRecord,
  ReleaseStatus,
  RoyaltyRecord,
  UserProfile,
  UserRole,
  VideoReleaseRecord,
} from '../types';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  DEFAULT_PLATFORMS,
  DEFAULT_PLATFORM_SETTINGS,
  DEFAULT_SUNIL_KUMAR_PROFILE,
} from '../constants';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function clamp(val: string | undefined, max: number): string {
  return (val ?? '').trim().slice(0, max);
}

export async function logAudit(params: {
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
}) {
  const id = makeId('aud');
  try {
    await setDoc(doc(db, 'audit_logs', id), {
      actorUid: params.actorUid,
      actorName: clamp(params.actorName, 120) || 'Platform User',
      actorRole: clamp(params.actorRole, 40),
      action: clamp(params.action, 120),
      entityType: clamp(params.entityType, 60),
      entityId: clamp(params.entityId, 128),
      summary: clamp(params.summary, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `audit_logs/${id}`);
  }
}

export async function dispatchNotification(params: {
  recipientUid?: string;
  recipientRole: 'all' | UserRole;
  category: NotificationCategory;
  title: string;
  message: string;
  releaseId?: string;
  emailDispatchEnabled?: boolean;
  actorUid: string;
}) {
  const id = makeId('ntf');
  try {
    await setDoc(doc(db, 'notifications', id), {
      recipientUid: clamp(params.recipientUid, 128),
      recipientRole: params.recipientRole,
      category: params.category,
      title: clamp(params.title, 180),
      message: clamp(params.message, 600),
      releaseId: clamp(params.releaseId, 128),
      read: false,
      emailDispatchEnabled: Boolean(params.emailDispatchEnabled),
      actorUid: params.actorUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}

export async function ensureUserAndBootstrap(firebaseUser: {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}): Promise<UserProfile> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const email = (firebaseUser.email ?? '').toLowerCase();
  const isBootstrappedAdmin = email === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  let profile: UserProfile;
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const role: UserRole = isBootstrappedAdmin ? 'super_admin' : 'artist';
      const payload = {
        uid: firebaseUser.uid,
        displayName: clamp(firebaseUser.displayName || email.split('@')[0] || 'Music High Sky User', 120),
        email: clamp(email, 200),
        photoURL: clamp(firebaseUser.photoURL || '', 1000),
        role,
        status: 'active' as const,
        emailNotifications: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, payload);
      profile = {
        ...payload,
        createdAt: null,
        updatedAt: null,
      };
    } else {
      profile = snap.data() as UserProfile;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
  }

  // Bootstrap Sunil Kumar official artist profile, DSP platform directory, and platform settings once for Super Admin
  if (profile.role === 'super_admin') {
    try {
      const artistRef = doc(db, 'artists', 'sunil-kumar');
      const artistSnap = await getDoc(artistRef);
      if (!artistSnap.exists()) {
        await setDoc(artistRef, {
          ...DEFAULT_SUNIL_KUMAR_PROFILE,
          updatedBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const settingsRef = doc(db, 'settings', 'platform');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          ...DEFAULT_PLATFORM_SETTINGS,
          updatedBy: firebaseUser.uid,
          updatedAt: serverTimestamp(),
        });
      }

      const samplePlatformSnap = await getDoc(doc(db, 'platforms', 'spotify'));
      if (!samplePlatformSnap.exists()) {
        for (const p of DEFAULT_PLATFORMS) {
          await setDoc(doc(db, 'platforms', p.id), {
            ...p,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bootstrap');
    }
  }

  return profile;
}

export async function updateArtistProfileRecord(
  artist: ArtistProfile,
  actor: UserProfile
) {
  const ref = doc(db, 'artists', artist.id);
  try {
    await updateDoc(ref, {
      name: clamp(artist.name, 120),
      professions: artist.professions.slice(0, 10),
      genres: artist.genres.slice(0, 15),
      languages: artist.languages.slice(0, 15),
      label: clamp(artist.label, 120),
      primaryMarket: clamp(artist.primaryMarket, 100),
      distributionScope: clamp(artist.distributionScope, 100),
      biography: clamp(artist.biography, 4000),
      profilePhotoUrl: clamp(artist.profilePhotoUrl, 350000),
      spotifyUrl: clamp(artist.spotifyUrl, 500),
      youtubeUrl: clamp(artist.youtubeUrl, 500),
      instagramUrl: clamp(artist.instagramUrl, 500),
      facebookUrl: clamp(artist.facebookUrl, 500),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'ARTIST_PROFILE_UPDATED',
      entityType: 'artists',
      entityId: artist.id,
      summary: `Updated official artist profile for ${artist.name}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `artists/${artist.id}`);
  }
}

export async function createFullReleaseSubmission(params: {
  release: Omit<ReleaseRecord, 'id' | 'createdAt' | 'updatedAt'>;
  audioTrack?: Omit<AudioTrackRecord, 'id' | 'releaseId' | 'ownerId' | 'createdAt' | 'updatedAt'>;
  videoRelease?: Omit<VideoReleaseRecord, 'id' | 'releaseId' | 'ownerId' | 'createdAt' | 'updatedAt'>;
  artwork?: Omit<ArtworkRecord, 'id' | 'releaseId' | 'ownerId' | 'createdAt' | 'updatedAt'>;
  actor: UserProfile;
  emailAlertsEnabled: boolean;
}): Promise<string> {
  const releaseId = makeId('rel');
  const { release, audioTrack, videoRelease, artwork, actor, emailAlertsEnabled } = params;

  try {
    await setDoc(doc(db, 'releases', releaseId), {
      releaseCode: clamp(release.releaseCode, 40),
      releaseType: release.releaseType,
      title: clamp(release.title, 200),
      subtitle: clamp(release.subtitle, 200),
      primaryArtist: clamp(release.primaryArtist, 150),
      featuredArtist: clamp(release.featuredArtist, 200),
      singer: clamp(release.singer, 200),
      lyricist: clamp(release.lyricist, 200),
      composer: clamp(release.composer, 200),
      musicProducer: clamp(release.musicProducer, 200),
      musicDirector: clamp(release.musicDirector, 200),
      mixingEngineer: clamp(release.mixingEngineer, 200),
      masteringEngineer: clamp(release.masteringEngineer, 200),
      genre: clamp(release.genre, 100),
      subgenre: clamp(release.subgenre, 100),
      language: clamp(release.language, 100),
      mood: clamp(release.mood, 100),
      explicitContent: Boolean(release.explicitContent),
      originalReleaseDate: clamp(release.originalReleaseDate, 40),
      plannedReleaseDate: clamp(release.plannedReleaseDate, 40),
      releaseTime: clamp(release.releaseTime, 20),
      copyrightYear: clamp(release.copyrightYear, 10),
      copyrightOwner: clamp(release.copyrightOwner, 200),
      phonographicCopyright: clamp(release.phonographicCopyright, 250),
      publishingCopyright: clamp(release.publishingCopyright, 250),
      distributorLabel: clamp(release.distributorLabel, 120) || 'Music High Sky',
      artistCredit: clamp(release.artistCredit, 150) || 'Sunil Kumar',
      labelCredit: clamp(release.labelCredit, 150) || 'Music High Sky',
      creditNotes: clamp(release.creditNotes, 500),
      targetPlatforms: (release.targetPlatforms ?? []).slice(0, 20),
      status: release.status,
      reviewNotes: clamp(release.reviewNotes, 1000),
      artworkPreview: clamp(release.artworkPreview, 350000),
      smartLinkSlug: clamp(release.smartLinkSlug, 120),
      submittedBy: actor.uid,
      submittedByName: clamp(actor.displayName, 120),
      submissionDate: clamp(release.submissionDate, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (audioTrack && release.releaseType === 'audio') {
      const trackId = makeId('trk');
      await setDoc(doc(db, 'audio_tracks', trackId), {
        releaseId,
        fileName: clamp(audioTrack.fileName, 260),
        format: audioTrack.format,
        fileSizeBytes: Number(audioTrack.fileSizeBytes) || 0,
        durationSeconds: Number(audioTrack.durationSeconds) || 0,
        sampleRate: Number(audioTrack.sampleRate) || 44100,
        channels: Number(audioTrack.channels) || 2,
        waveformPeaks: (audioTrack.waveformPeaks ?? []).slice(0, 128),
        masterSourceUrl: clamp(audioTrack.masterSourceUrl, 1000),
        validated: Boolean(audioTrack.validated),
        ownerId: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (videoRelease && release.releaseType === 'video') {
      const videoId = makeId('vid');
      await setDoc(doc(db, 'video_releases', videoId), {
        releaseId,
        director: clamp(videoRelease.director, 200),
        producer: clamp(videoRelease.producer, 200),
        productionCompany: clamp(videoRelease.productionCompany, 200),
        description: clamp(videoRelease.description, 3000),
        fileName: clamp(videoRelease.fileName, 260),
        format: videoRelease.format,
        fileSizeBytes: Number(videoRelease.fileSizeBytes) || 0,
        durationSeconds: Number(videoRelease.durationSeconds) || 0,
        resolution: clamp(videoRelease.resolution, 40),
        youtubeUrl: clamp(videoRelease.youtubeUrl, 500),
        videoCopyrightInfo: clamp(videoRelease.videoCopyrightInfo, 500),
        masterSourceUrl: clamp(videoRelease.masterSourceUrl, 1000),
        thumbnailPreview: clamp(videoRelease.thumbnailPreview, 350000),
        validated: Boolean(videoRelease.validated),
        ownerId: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (artwork) {
      const artworkId = makeId('art');
      await setDoc(doc(db, 'artwork', artworkId), {
        releaseId,
        kind: artwork.kind,
        fileName: clamp(artwork.fileName, 260),
        format: artwork.format,
        width: Number(artwork.width) || 0,
        height: Number(artwork.height) || 0,
        aspectRatioValid: Boolean(artwork.aspectRatioValid),
        previewDataUrl: clamp(artwork.previewDataUrl, 350000),
        locked: false,
        ownerId: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Create transparent Planned distribution records for each selected DSP destination
    for (const platformName of (release.targetPlatforms ?? []).slice(0, 20)) {
      const distId = makeId('dst');
      await setDoc(doc(db, 'distribution_records', distId), {
        releaseId,
        releaseTitle: clamp(release.title, 200),
        releaseType: release.releaseType,
        platformId: platformName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80),
        platformName: clamp(platformName, 120),
        distributorLabel: 'Music High Sky',
        partnerName: '',
        externalReferenceId: '',
        status: 'Planned',
        deliveryConfirmedDate: '',
        liveUrl: '',
        evidenceNotes: 'Awaiting label approval and authorized partner delivery.',
        ownerId: actor.uid,
        updatedBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await dispatchNotification({
      recipientRole: 'super_admin',
      category: release.status === 'Submitted' ? 'New Song Submission' : 'Submission Received',
      title: `${release.releaseType === 'audio' ? 'Audio' : 'Video'} Release ${release.status}: ${release.title}`,
      message: `${actor.displayName} saved "${release.title}" (${release.releaseCode}) under Music High Sky with status ${release.status}.`,
      releaseId,
      emailDispatchEnabled: emailAlertsEnabled,
      actorUid: actor.uid,
    });

    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'RELEASE_CREATED',
      entityType: 'releases',
      entityId: releaseId,
      summary: `Created ${release.releaseType} release "${release.title}" (${release.releaseCode}) as ${release.status}.`,
    });

    return releaseId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `releases/${releaseId}`);
  }
}

export async function updateReleaseStatusAndReview(params: {
  release: ReleaseRecord;
  newStatus: ReleaseStatus;
  reviewNotes?: string;
  plannedReleaseDate?: string;
  releaseTime?: string;
  actor: UserProfile;
  emailAlertsEnabled: boolean;
}) {
  const { release, newStatus, reviewNotes, plannedReleaseDate, releaseTime, actor, emailAlertsEnabled } = params;
  const ref = doc(db, 'releases', release.id);
  try {
    const patch: Record<string, unknown> = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (reviewNotes !== undefined) patch.reviewNotes = clamp(reviewNotes, 1000);
    if (plannedReleaseDate !== undefined) patch.plannedReleaseDate = clamp(plannedReleaseDate, 40);
    if (releaseTime !== undefined) patch.releaseTime = clamp(releaseTime, 20);

    await updateDoc(ref, patch);

    const statusToCategory: Partial<Record<ReleaseStatus, NotificationCategory>> = {
      Submitted: 'Submission Received',
      'Metadata Correction Required': 'Metadata Correction Required',
      Approved: 'Release Approved',
      Scheduled: 'Release Scheduled',
      Delivered: 'Distribution Completed',
      Live: 'Song Live on Platform',
    };

    const category = statusToCategory[newStatus] ?? 'Release Approved';
    await dispatchNotification({
      recipientUid: release.submittedBy,
      recipientRole: 'artist',
      category,
      title: `${release.title} — ${newStatus}`,
      message: reviewNotes
        ? `Status updated to ${newStatus}. Note: ${reviewNotes}`
        : `Release ${release.releaseCode} transitioned to ${newStatus} by ${actor.displayName}.`,
      releaseId: release.id,
      emailDispatchEnabled: emailAlertsEnabled,
      actorUid: actor.uid,
    });

    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'RELEASE_STATUS_CHANGED',
      entityType: 'releases',
      entityId: release.id,
      summary: `Changed "${release.title}" (${release.releaseCode}) from ${release.status} to ${newStatus}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `releases/${release.id}`);
  }
}

export async function replacePreApprovalArtwork(params: {
  release: ReleaseRecord;
  artworkId?: string;
  previewDataUrl: string;
  fileName: string;
  format: 'JPG' | 'JPEG' | 'PNG';
  width: number;
  height: number;
  aspectRatioValid: boolean;
  actor: UserProfile;
}) {
  const { release, artworkId, previewDataUrl, fileName, format, width, height, aspectRatioValid, actor } = params;
  try {
    await updateDoc(doc(db, 'releases', release.id), {
      artworkPreview: clamp(previewDataUrl, 350000),
      updatedAt: serverTimestamp(),
    });
    if (artworkId) {
      await updateDoc(doc(db, 'artwork', artworkId), {
        fileName: clamp(fileName, 260),
        format,
        width,
        height,
        aspectRatioValid,
        previewDataUrl: clamp(previewDataUrl, 350000),
        updatedAt: serverTimestamp(),
      });
    } else {
      const newArtId = makeId('art');
      await setDoc(doc(db, 'artwork', newArtId), {
        releaseId: release.id,
        kind: release.releaseType === 'video' ? 'video_thumbnail' : 'cover_art',
        fileName: clamp(fileName, 260),
        format,
        width,
        height,
        aspectRatioValid,
        previewDataUrl: clamp(previewDataUrl, 350000),
        locked: false,
        ownerId: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'ARTWORK_REPLACED',
      entityType: 'releases',
      entityId: release.id,
      summary: `Replaced artwork for "${release.title}" (${width}x${height} ${format}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `releases/${release.id}`);
  }
}

export async function updateDistributionRecordItem(params: {
  record: DistributionRecord;
  partnerName: string;
  externalReferenceId: string;
  status: DistributionStatus;
  deliveryConfirmedDate: string;
  liveUrl: string;
  evidenceNotes: string;
  actor: UserProfile;
  emailAlertsEnabled: boolean;
}) {
  const { record, partnerName, externalReferenceId, status, deliveryConfirmedDate, liveUrl, evidenceNotes, actor, emailAlertsEnabled } = params;
  try {
    await updateDoc(doc(db, 'distribution_records', record.id), {
      partnerName: clamp(partnerName, 150),
      externalReferenceId: clamp(externalReferenceId, 150),
      status,
      deliveryConfirmedDate: clamp(deliveryConfirmedDate, 40),
      liveUrl: clamp(liveUrl, 500),
      evidenceNotes: clamp(evidenceNotes, 1000),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    if (status === 'Delivered' || status === 'Live') {
      await dispatchNotification({
        recipientRole: 'artist',
        category: status === 'Live' ? 'Song Live on Platform' : 'Distribution Completed',
        title: `${record.releaseTitle} — ${status} on ${record.platformName}`,
        message: `Partner: ${partnerName || 'Authorized Partner'} | Ref: ${externalReferenceId || 'Recorded'}`,
        releaseId: record.releaseId,
        emailDispatchEnabled: emailAlertsEnabled,
        actorUid: actor.uid,
      });
    }

    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'DISTRIBUTION_UPDATED',
      entityType: 'distribution_records',
      entityId: record.id,
      summary: `Updated ${record.platformName} delivery for "${record.releaseTitle}" to ${status}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `distribution_records/${record.id}`);
  }
}

export async function createVerifiedRoyaltyAndAnalytics(params: {
  entries: Omit<RoyaltyRecord, 'id' | 'verifiedBy' | 'createdAt' | 'updatedAt'>[];
  actor: UserProfile;
  emailAlertsEnabled: boolean;
}) {
  const { entries, actor, emailAlertsEnabled } = params;
  try {
    for (const item of entries) {
      const royId = makeId('roy');
      await setDoc(doc(db, 'royalties', royId), {
        period: clamp(item.period, 20),
        releaseId: clamp(item.releaseId, 128),
        releaseTitle: clamp(item.releaseTitle, 200),
        platformName: clamp(item.platformName, 120),
        territory: clamp(item.territory || 'India', 100),
        currency: item.currency,
        streams: Math.max(0, Number(item.streams) || 0),
        estimatedRoyalty: Math.max(0, Number(item.estimatedRoyalty) || 0),
        confirmedRoyalty: Math.max(0, Number(item.confirmedRoyalty) || 0),
        paymentStatus: item.paymentStatus,
        paymentReference: clamp(item.paymentReference, 150),
        paidDate: clamp(item.paidDate, 40),
        sourceType: item.sourceType,
        sourceReportName: clamp(item.sourceReportName, 200),
        verifiedBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const anlId = makeId('anl');
      await setDoc(doc(db, 'analytics', anlId), {
        period: clamp(item.period, 20),
        releaseId: clamp(item.releaseId, 128),
        releaseTitle: clamp(item.releaseTitle, 200),
        platformName: clamp(item.platformName, 120),
        territory: clamp(item.territory || 'India', 100),
        streams: Math.max(0, Number(item.streams) || 0),
        sourceReportName: clamp(item.sourceReportName, 200),
        verifiedBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await dispatchNotification({
      recipientRole: 'artist',
      category: 'Royalty Report Available',
      title: `Verified Royalty Report Recorded (${entries.length} row${entries.length === 1 ? '' : 's'})`,
      message: `${actor.displayName} imported/recorded verified DSP performance and royalty data.`,
      emailDispatchEnabled: emailAlertsEnabled,
      actorUid: actor.uid,
    });

    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'ROYALTY_REPORT_ADDED',
      entityType: 'royalties',
      summary: `Recorded ${entries.length} verified royalty & analytics entries.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'royalties');
  }
}

export async function updateRoyaltyPaymentStatus(params: {
  royalty: RoyaltyRecord;
  paymentStatus: RoyaltyRecord['paymentStatus'];
  paymentReference: string;
  paidDate: string;
  actor: UserProfile;
  emailAlertsEnabled: boolean;
}) {
  const { royalty, paymentStatus, paymentReference, paidDate, actor, emailAlertsEnabled } = params;
  try {
    await updateDoc(doc(db, 'royalties', royalty.id), {
      paymentStatus,
      paymentReference: clamp(paymentReference, 150),
      paidDate: clamp(paidDate, 40),
      updatedAt: serverTimestamp(),
    });
    await dispatchNotification({
      recipientRole: 'artist',
      category: 'Payment Status Updated',
      title: `Royalty Payment ${paymentStatus}: ${royalty.releaseTitle}`,
      message: `${royalty.period} (${royalty.platformName}) updated to ${paymentStatus}. Ref: ${paymentReference || 'N/A'}`,
      emailDispatchEnabled: emailAlertsEnabled,
      actorUid: actor.uid,
    });
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'ROYALTY_PAYMENT_UPDATED',
      entityType: 'royalties',
      entityId: royalty.id,
      summary: `Updated payout status for ${royalty.releaseTitle} (${royalty.period}) to ${paymentStatus}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `royalties/${royalty.id}`);
  }
}

export async function saveCopyrightRecord(params: {
  existingId?: string;
  record: Omit<CopyrightRecord, 'id' | 'createdAt' | 'updatedAt'>;
  actor: UserProfile;
}) {
  const { existingId, record, actor } = params;
  const id = existingId || makeId('cpr');
  try {
    const payload = {
      releaseId: clamp(record.releaseId, 128),
      releaseTitle: clamp(record.releaseTitle, 200),
      songOwnership: clamp(record.songOwnership, 250),
      masterRecordingRights: clamp(record.masterRecordingRights, 250),
      publishingRights: clamp(record.publishingRights, 250),
      lyricsOwnership: clamp(record.lyricsOwnership, 250),
      compositionOwnership: clamp(record.compositionOwnership, 250),
      registrationNumber: clamp(record.registrationNumber, 120),
      isrc: clamp(record.isrc, 40),
      upcEan: clamp(record.upcEan, 40),
      contentIdStatus: record.contentIdStatus,
      contentIdAssetId: clamp(record.contentIdAssetId, 120),
      licensingNotes: clamp(record.licensingNotes, 1000),
      distributionAgreementRef: clamp(record.distributionAgreementRef, 200),
      takedownStatus: record.takedownStatus,
      takedownNotes: clamp(record.takedownNotes, 500),
      verifiedByAdmin: Boolean(record.verifiedByAdmin),
      verifiedByUid: record.verifiedByAdmin ? actor.uid : '',
      updatedAt: serverTimestamp(),
    };

    if (existingId) {
      const { releaseId: _r, releaseTitle: _t, ...updatable } = payload;
      await updateDoc(doc(db, 'copyright_records', id), updatable);
    } else {
      await setDoc(doc(db, 'copyright_records', id), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }

    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: existingId ? 'COPYRIGHT_UPDATED' : 'COPYRIGHT_CREATED',
      entityType: 'copyright_records',
      entityId: id,
      summary: `${existingId ? 'Updated' : 'Recorded'} rights entry for "${record.releaseTitle}" (Verified: ${record.verifiedByAdmin ? 'Yes' : 'No'}).`,
    });
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, `copyright_records/${id}`);
  }
}

export async function updateUserRoleOrStatus(params: {
  targetUser: UserProfile;
  role: UserRole;
  status: 'active' | 'suspended';
  actor: UserProfile;
}) {
  const { targetUser, role, status, actor } = params;
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      role,
      status,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'USER_ROLE_UPDATED',
      entityType: 'users',
      entityId: targetUser.uid,
      summary: `Updated ${targetUser.email} to role ${role} (${status}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function markNotificationRead(id: string) {
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
  }
}

export async function updatePlatformSettingsRecord(
  settings: PlatformSettings,
  actor: UserProfile
) {
  try {
    await updateDoc(doc(db, 'settings', settings.id), {
      labelName: clamp(settings.labelName, 120),
      defaultArtistCredit: clamp(settings.defaultArtistCredit, 120),
      defaultLabelCredit: clamp(settings.defaultLabelCredit, 120),
      defaultCopyrightNotice: clamp(settings.defaultCopyrightNotice, 300),
      supportEmail: clamp(settings.supportEmail, 200),
      emailNotificationsEnabled: Boolean(settings.emailNotificationsEnabled),
      reminderDaysBeforeRelease: Number(settings.reminderDaysBeforeRelease) || 7,
      defaultCurrency: settings.defaultCurrency,
      payoutGatewayLabel: clamp(settings.payoutGatewayLabel, 150),
      partnerApiMode: settings.partnerApiMode || 'Manual Partner Workflow',
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'SETTINGS_UPDATED',
      entityType: 'settings',
      entityId: settings.id,
      summary: 'Updated Music High Sky platform settings.',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `settings/${settings.id}`);
  }
}

export async function deleteReleaseByAdmin(release: ReleaseRecord, actor: UserProfile) {
  try {
    await deleteDoc(doc(db, 'releases', release.id));
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'RELEASE_DELETED',
      entityType: 'releases',
      entityId: release.id,
      summary: `Deleted release "${release.title}" (${release.releaseCode}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `releases/${release.id}`);
  }
}

export async function addVerifiedAnalyticsOnly(params: {
  entry: Omit<AnalyticsRecord, 'id' | 'verifiedBy' | 'createdAt' | 'updatedAt'>;
  actor: UserProfile;
}) {
  const id = makeId('anl');
  try {
    await setDoc(doc(db, 'analytics', id), {
      period: clamp(params.entry.period, 20),
      releaseId: clamp(params.entry.releaseId, 128),
      releaseTitle: clamp(params.entry.releaseTitle, 200),
      platformName: clamp(params.entry.platformName, 120),
      territory: clamp(params.entry.territory, 100),
      streams: Math.max(0, Number(params.entry.streams) || 0),
      sourceReportName: clamp(params.entry.sourceReportName, 200),
      verifiedBy: params.actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `analytics/${id}`);
  }
}

const SAMPLE_RELEASE_CODE_RE = /^(DEMO|SAMPLE|DUMMY|TEST|PLACEHOLDER)[-_]/i;
const SAMPLE_TITLE_RE = /^(sample|demo|dummy|placeholder|test)\s+(song|track|release|album|video|audio)\b/i;

function isUnmistakableSampleRelease(rel: ReleaseRecord, protectedIds: Set<string>): boolean {
  if (protectedIds.has(rel.id)) return false;
  if (rel.artworkPreview?.startsWith('/assets/aistudio/')) return false;
  if (SAMPLE_RELEASE_CODE_RE.test(rel.releaseCode || '')) return true;
  if (SAMPLE_TITLE_RE.test((rel.title || '').trim())) return true;
  return false;
}

export interface AttachedCatalogSyncResult {
  addedReleases: number;
  addedTracks: number;
  addedArtworks: number;
  removedSampleReleases: number;
  totalCatalogFiles: number;
}

/**
 * Idempotently synchronizes all processed attached MP3 files for Sunil Kumar
 * (under Music High Sky) into Cloud Firestore without creating duplicates,
 * and safely removes unmistakable sample/demo placeholder records if present
 * while preserving all genuine uploaded music and ambiguous records.
 */
export async function syncAttachedCatalogToFirestore(
  actor: UserProfile
): Promise<AttachedCatalogSyncResult> {
  const { ATTACHED_SUNIL_KUMAR_CATALOG } = await import('../data/attachedCatalog');
  const result: AttachedCatalogSyncResult = {
    addedReleases: 0,
    addedTracks: 0,
    addedArtworks: 0,
    removedSampleReleases: 0,
    totalCatalogFiles: ATTACHED_SUNIL_KUMAR_CATALOG.length,
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const protectedIds = new Set(ATTACHED_SUNIL_KUMAR_CATALOG.map((item) => item.releaseId));

  try {
    const [releasesSnap, tracksSnap, artworksSnap] = await Promise.all([
      getDocs(query(collection(db, 'releases'), where('distributorLabel', '==', 'Music High Sky'))),
      getDocs(query(collection(db, 'audio_tracks'), where('validated', '==', true))),
      getDocs(
        query(
          collection(db, 'artwork'),
          where('kind', 'in', ['cover_art', 'video_thumbnail', 'promo_banner'])
        )
      ),
    ]);

    const existingReleases = releasesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ReleaseRecord, 'id'>),
    }));
    const existingTracks = tracksSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AudioTrackRecord, 'id'>),
    }));
    const existingArtworks = artworksSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ArtworkRecord, 'id'>),
    }));

    const existingReleaseIds = new Set(existingReleases.map((r) => r.id));
    const existingReleaseCodes = new Set(existingReleases.map((r) => r.releaseCode));
    const existingTrackReleaseIds = new Set(existingTracks.map((t) => t.releaseId));
    const existingMasterUrls = new Set(
      existingTracks.map((t) => t.masterSourceUrl).filter((u): u is string => Boolean(u))
    );
    const existingArtworkReleaseIds = new Set(existingArtworks.map((a) => a.releaseId));

    // Step 1: Remove only unmistakable sample/demo placeholder records (Super Admin only).
    // Genuine uploads and ambiguous records are always preserved.
    if (actor.role === 'super_admin') {
      for (const rel of existingReleases) {
        const linkedTrack = existingTracks.find((t) => t.releaseId === rel.id);
        if (linkedTrack?.masterSourceUrl?.startsWith('/assets/aistudio/')) {
          continue;
        }
        if (isUnmistakableSampleRelease(rel, protectedIds)) {
          await deleteDoc(doc(db, 'releases', rel.id));
          for (const trk of existingTracks.filter((t) => t.releaseId === rel.id)) {
            await deleteDoc(doc(db, 'audio_tracks', trk.id));
          }
          for (const art of existingArtworks.filter((a) => a.releaseId === rel.id)) {
            await deleteDoc(doc(db, 'artwork', art.id));
          }
          result.removedSampleReleases += 1;
        }
      }
    }

    // Step 2: Idempotently upsert each attached MP3 song record, audio_track, and extracted cover art.
    for (const entry of ATTACHED_SUNIL_KUMAR_CATALOG) {
      const releaseAlreadyExists =
        existingReleaseIds.has(entry.releaseId) ||
        existingReleaseCodes.has(entry.releaseCode) ||
        existingMasterUrls.has(entry.masterSourceUrl);

      if (!releaseAlreadyExists) {
        await setDoc(doc(db, 'releases', entry.releaseId), {
          releaseCode: clamp(entry.releaseCode, 40),
          releaseType: 'audio',
          title: clamp(entry.title, 200),
          subtitle: clamp(entry.subtitle, 200),
          primaryArtist: 'Sunil Kumar',
          featuredArtist: '',
          singer: clamp(entry.singer || 'Sunil Kumar', 200),
          lyricist: clamp(entry.lyricist, 200),
          composer: clamp(entry.composer, 200),
          musicProducer: '',
          musicDirector: '',
          mixingEngineer: '',
          masteringEngineer: '',
          genre: clamp(entry.genre, 100) || 'Pending Classification',
          subgenre: clamp(entry.subgenre, 100),
          language: clamp(entry.language, 100) || 'Hindi',
          mood: '',
          explicitContent: false,
          originalReleaseDate: clamp(entry.originalReleaseDate, 40),
          plannedReleaseDate: clamp(entry.plannedReleaseDate, 40),
          releaseTime: '',
          copyrightYear: '',
          copyrightOwner: '',
          phonographicCopyright: '',
          publishingCopyright: '',
          distributorLabel: 'Music High Sky',
          artistCredit: 'Sunil Kumar',
          labelCredit: 'Music High Sky',
          creditNotes: '',
          targetPlatforms: [],
          status: 'Submitted',
          reviewNotes: clamp(entry.reviewNotes, 1000),
          artworkPreview: clamp(entry.artwork?.previewDataUrl || '', 350000),
          smartLinkSlug: '',
          submittedBy: actor.uid,
          submittedByName: clamp(actor.displayName, 120),
          submissionDate: todayIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingReleaseIds.add(entry.releaseId);
        existingReleaseCodes.add(entry.releaseCode);
        result.addedReleases += 1;
      }

      // Ensure linked audio_track exists once release document is committed
      const targetReleaseId = existingReleaseIds.has(entry.releaseId) ? entry.releaseId : null;
      if (
        targetReleaseId &&
        !existingTrackReleaseIds.has(targetReleaseId) &&
        !existingMasterUrls.has(entry.masterSourceUrl)
      ) {
        await setDoc(doc(db, 'audio_tracks', entry.trackId), {
          releaseId: targetReleaseId,
          fileName: clamp(entry.fileName, 260),
          format: entry.format,
          fileSizeBytes: entry.fileSizeBytes,
          durationSeconds: entry.durationSeconds,
          sampleRate: entry.sampleRate,
          channels: entry.channels,
          waveformPeaks: entry.waveformPeaks.slice(0, 128),
          masterSourceUrl: clamp(entry.masterSourceUrl, 1000),
          validated: true,
          ownerId: actor.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingTrackReleaseIds.add(targetReleaseId);
        existingMasterUrls.add(entry.masterSourceUrl);
        result.addedTracks += 1;
      }

      // Ensure linked extracted cover artwork exists where embedded APIC art was found
      if (
        targetReleaseId &&
        entry.artwork &&
        entry.artworkId &&
        !existingArtworkReleaseIds.has(targetReleaseId)
      ) {
        await setDoc(doc(db, 'artwork', entry.artworkId), {
          releaseId: targetReleaseId,
          kind: 'cover_art',
          fileName: clamp(entry.artwork.fileName, 260),
          format: entry.artwork.format,
          width: entry.artwork.width,
          height: entry.artwork.height,
          aspectRatioValid: entry.artwork.aspectRatioValid,
          previewDataUrl: clamp(entry.artwork.previewDataUrl, 350000),
          locked: false,
          ownerId: actor.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingArtworkReleaseIds.add(targetReleaseId);
        result.addedArtworks += 1;
      }
    }

    if (
      result.addedReleases > 0 ||
      result.addedTracks > 0 ||
      result.removedSampleReleases > 0
    ) {
      await logAudit({
        actorUid: actor.uid,
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'ATTACHED_CATALOG_SYNCED',
        entityType: 'releases',
        summary: `Synced Sunil Kumar attached audio catalog (${result.addedReleases} releases, ${result.addedTracks} audio masters, ${result.addedArtworks} embedded covers; ${result.removedSampleReleases} demo records removed).`,
      });
    }

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attached_catalog_sync');
  }
}

export interface OfficialPlaylistTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  category:
    | 'all_songs'
    | 'latest'
    | 'hindi'
    | 'haryanvi'
    | 'romantic'
    | 'emotional'
    | 'motivational'
    | 'rap_cinematic'
    | 'videos';
  mediaKind: 'audio' | 'video' | 'mixed';
  displayOrder: number;
  featured: boolean;
  autoRule: string;
}

export const OFFICIAL_SUNIL_KUMAR_PLAYLIST_TEMPLATES: OfficialPlaylistTemplate[] = [
  {
    id: 'all-songs-sunil-kumar',
    slug: 'all-songs-sunil-kumar',
    name: 'All Songs – Sunil Kumar',
    description: 'Complete official audio discography by Sunil Kumar released under Music High Sky.',
    category: 'all_songs',
    mediaKind: 'audio',
    displayOrder: 1,
    featured: true,
    autoRule: 'releaseType == audio',
  },
  {
    id: 'latest-releases',
    slug: 'latest-releases',
    name: 'Latest Releases',
    description: 'Newest verified audio and video releases from Sunil Kumar on Music High Sky.',
    category: 'latest',
    mediaKind: 'mixed',
    displayOrder: 2,
    featured: true,
    autoRule: 'latest_verified_releases',
  },
  {
    id: 'hindi-songs',
    slug: 'hindi-songs',
    name: 'Hindi Songs',
    description: 'Official Hindi songs written and performed by Sunil Kumar.',
    category: 'hindi',
    mediaKind: 'audio',
    displayOrder: 3,
    featured: true,
    autoRule: 'language == Hindi',
  },
  {
    id: 'haryanvi-songs',
    slug: 'haryanvi-songs',
    name: 'Haryanvi Songs',
    description: 'Official Haryanvi releases by Sunil Kumar under Music High Sky.',
    category: 'haryanvi',
    mediaKind: 'audio',
    displayOrder: 4,
    featured: true,
    autoRule: 'language == Haryanvi',
  },
  {
    id: 'romantic-songs',
    slug: 'romantic-songs',
    name: 'Romantic Songs',
    description: 'Heartfelt romantic melodies by Sunil Kumar (populated from verified genre/mood metadata).',
    category: 'romantic',
    mediaKind: 'audio',
    displayOrder: 5,
    featured: false,
    autoRule: 'genre_or_mood == Romantic',
  },
  {
    id: 'emotional-songs',
    slug: 'emotional-songs',
    name: 'Emotional Songs',
    description: 'Deeply expressive and emotional tracks by Sunil Kumar.',
    category: 'emotional',
    mediaKind: 'audio',
    displayOrder: 6,
    featured: false,
    autoRule: 'genre_or_mood == Emotional',
  },
  {
    id: 'motivational-songs',
    slug: 'motivational-songs',
    name: 'Motivational Songs',
    description: 'High-conviction motivational anthems by Sunil Kumar.',
    category: 'motivational',
    mediaKind: 'audio',
    displayOrder: 7,
    featured: false,
    autoRule: 'genre_or_mood == Motivational',
  },
  {
    id: 'rap-cinematic-songs',
    slug: 'rap-cinematic-songs',
    name: 'Rap & Cinematic Songs',
    description: 'Original rap, hip-hop, and cinematic productions by Sunil Kumar.',
    category: 'rap_cinematic',
    mediaKind: 'audio',
    displayOrder: 8,
    featured: false,
    autoRule: 'genre_or_mood in [Rap, Hip-Hop, Cinematic]',
  },
  {
    id: 'official-music-videos',
    slug: 'official-music-videos',
    name: 'Official Music Videos',
    description: 'Cinema-grade official music videos by Sunil Kumar released via Music High Sky.',
    category: 'videos',
    mediaKind: 'video',
    displayOrder: 9,
    featured: true,
    autoRule: 'releaseType == video',
  },
];

function doesReleaseMatchOfficialPlaylist(
  rel: ReleaseRecord,
  category: OfficialPlaylistTemplate['category']
): boolean {
  const lang = (rel.language || '').toLowerCase();
  const genre = (rel.genre || '').toLowerCase();
  const subgenre = (rel.subgenre || '').toLowerCase();
  const mood = (rel.mood || '').toLowerCase();
  const metaCombined = `${genre} ${subgenre} ${mood}`;

  switch (category) {
    case 'all_songs':
      return rel.releaseType === 'audio';
    case 'latest':
      return true;
    case 'hindi':
      return rel.releaseType === 'audio' && lang.includes('hindi');
    case 'haryanvi':
      return (
        rel.releaseType === 'audio' &&
        (lang.includes('haryanvi') || genre.includes('haryanvi'))
      );
    case 'romantic':
      return rel.releaseType === 'audio' && metaCombined.includes('romantic');
    case 'emotional':
      return rel.releaseType === 'audio' && metaCombined.includes('emotional');
    case 'motivational':
      return rel.releaseType === 'audio' && metaCombined.includes('motivational');
    case 'rap_cinematic':
      return (
        rel.releaseType === 'audio' &&
        (metaCombined.includes('rap') ||
          metaCombined.includes('hip-hop') ||
          metaCombined.includes('hip hop') ||
          metaCombined.includes('cinematic'))
      );
    case 'videos':
      return rel.releaseType === 'video';
  }
}

/**
 * Ensures all 9 official Sunil Kumar playlists exist in Firestore and populates
 * verified matching tracks without duplicating existing playlist_tracks entries.
 */
export async function syncOfficialPlaylistsToFirestore(
  actor: UserProfile,
  releases: ReleaseRecord[]
): Promise<{ createdPlaylists: number; addedTrackLinks: number }> {
  if (actor.role !== 'super_admin' && actor.role !== 'label_manager') {
    return { createdPlaylists: 0, addedTrackLinks: 0 };
  }

  let createdPlaylists = 0;
  let addedTrackLinks = 0;

  try {
    const [plSnap, linksSnap] = await Promise.all([
      getDocs(query(collection(db, 'playlists'), where('label', '==', 'Music High Sky'))),
      getDocs(query(collection(db, 'playlist_tracks'), where('position', '>=', 0))),
    ]);

    const existingPlaylistIds = new Set(plSnap.docs.map((d) => d.id));
    const existingLinksByPlaylist = new Map<string, Set<string>>();
    const maxPosByPlaylist = new Map<string, number>();

    for (const d of linksSnap.docs) {
      const data = d.data() as { playlistId: string; releaseId: string; position: number };
      if (!existingLinksByPlaylist.has(data.playlistId)) {
        existingLinksByPlaylist.set(data.playlistId, new Set());
      }
      existingLinksByPlaylist.get(data.playlistId)!.add(data.releaseId);
      const prevMax = maxPosByPlaylist.get(data.playlistId) ?? -1;
      if (data.position > prevMax) maxPosByPlaylist.set(data.playlistId, data.position);
    }

    const sortedNewest = [...releases].sort((a, b) => {
      const da = a.plannedReleaseDate || a.submissionDate || '';
      const dbStr = b.plannedReleaseDate || b.submissionDate || '';
      if (dbStr !== da) return dbStr.localeCompare(da);
      return a.title.localeCompare(b.title);
    });

    for (const tpl of OFFICIAL_SUNIL_KUMAR_PLAYLIST_TEMPLATES) {
      const matching =
        tpl.category === 'latest'
          ? sortedNewest.slice(0, 12)
          : sortedNewest.filter((r) => doesReleaseMatchOfficialPlaylist(r, tpl.category));

      const coverCandidate = matching.find((r) => r.artworkPreview)?.artworkPreview || '';

      if (!existingPlaylistIds.has(tpl.id)) {
        await setDoc(doc(db, 'playlists', tpl.id), {
          id: tpl.id,
          slug: tpl.slug,
          name: tpl.name,
          description: tpl.description,
          artistId: 'sunil-kumar',
          artistName: 'Sunil Kumar',
          label: 'Music High Sky',
          category: tpl.category,
          mediaKind: tpl.mediaKind,
          coverArtworkUrl: clamp(coverCandidate, 350000),
          featured: tpl.featured,
          displayOrder: tpl.displayOrder,
          autoRule: tpl.autoRule,
          createdBy: actor.uid,
          updatedBy: actor.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingPlaylistIds.add(tpl.id);
        createdPlaylists += 1;
      }

      const linkedSet = existingLinksByPlaylist.get(tpl.id) || new Set<string>();
      let nextPos = (maxPosByPlaylist.get(tpl.id) ?? -1) + 1;

      for (const rel of matching) {
        if (linkedSet.has(rel.id)) continue;
        const linkId = `plt_${tpl.id}_${rel.id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
        await setDoc(doc(db, 'playlist_tracks', linkId), {
          playlistId: tpl.id,
          releaseId: rel.id,
          position: nextPos,
          addedBy: actor.uid,
          createdAt: serverTimestamp(),
        });
        linkedSet.add(rel.id);
        nextPos += 1;
        addedTrackLinks += 1;
      }
      existingLinksByPlaylist.set(tpl.id, linkedSet);
      maxPosByPlaylist.set(tpl.id, nextPos - 1);
    }

    return { createdPlaylists, addedTrackLinks };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'playlists');
  }
}

export async function updatePlaylistMetadata(params: {
  playlistId: string;
  name: string;
  description: string;
  coverArtworkUrl?: string;
  featured: boolean;
  displayOrder: number;
  actor: UserProfile;
}) {
  try {
    const patch: Record<string, unknown> = {
      name: clamp(params.name, 160),
      description: clamp(params.description, 1000),
      featured: Boolean(params.featured),
      displayOrder: Math.max(0, Math.min(1000, Number(params.displayOrder) || 0)),
      updatedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    };
    if (params.coverArtworkUrl !== undefined) {
      patch.coverArtworkUrl = clamp(params.coverArtworkUrl, 350000);
    }
    await updateDoc(doc(db, 'playlists', params.playlistId), patch);
    await logAudit({
      actorUid: params.actor.uid,
      actorName: params.actor.displayName,
      actorRole: params.actor.role,
      action: 'PLAYLIST_UPDATED',
      entityType: 'playlists',
      entityId: params.playlistId,
      summary: `Updated playlist "${params.name}".`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `playlists/${params.playlistId}`);
  }
}

export async function createCustomPlaylist(params: {
  name: string;
  description: string;
  mediaKind: 'audio' | 'video' | 'mixed';
  coverArtworkUrl?: string;
  displayOrder: number;
  actor: UserProfile;
}): Promise<string> {
  const slug =
    params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'custom-playlist';
  const id = makeId(`pl_${slug.slice(0, 24)}`);
  try {
    await setDoc(doc(db, 'playlists', id), {
      id,
      slug,
      name: clamp(params.name, 160),
      description: clamp(params.description, 1000),
      artistId: 'sunil-kumar',
      artistName: 'Sunil Kumar',
      label: 'Music High Sky',
      category: 'custom',
      mediaKind: params.mediaKind,
      coverArtworkUrl: clamp(params.coverArtworkUrl, 350000),
      featured: false,
      displayOrder: Math.max(0, Math.min(1000, Number(params.displayOrder) || 10)),
      autoRule: 'manual',
      createdBy: params.actor.uid,
      updatedBy: params.actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: params.actor.uid,
      actorName: params.actor.displayName,
      actorRole: params.actor.role,
      action: 'PLAYLIST_CREATED',
      entityType: 'playlists',
      entityId: id,
      summary: `Created playlist "${params.name}".`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `playlists/${id}`);
  }
}

export async function addReleaseToPlaylist(params: {
  playlistId: string;
  releaseId: string;
  position: number;
  actor: UserProfile;
}) {
  const linkId = `plt_${params.playlistId}_${params.releaseId}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  try {
    await setDoc(doc(db, 'playlist_tracks', linkId), {
      playlistId: params.playlistId,
      releaseId: params.releaseId,
      position: Math.max(0, Math.min(5000, params.position)),
      addedBy: params.actor.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `playlist_tracks/${linkId}`);
  }
}

export async function removeTrackFromPlaylist(linkId: string) {
  try {
    await deleteDoc(doc(db, 'playlist_tracks', linkId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `playlist_tracks/${linkId}`);
  }
}

export async function swapPlaylistTrackPositions(
  trackA: { id: string; position: number },
  trackB: { id: string; position: number }
) {
  try {
    await Promise.all([
      updateDoc(doc(db, 'playlist_tracks', trackA.id), { position: trackB.position }),
      updateDoc(doc(db, 'playlist_tracks', trackB.id), { position: trackA.position }),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `playlist_tracks/${trackA.id}`);
  }
}

export async function toggleReleaseFeatured(params: {
  release: ReleaseRecord;
  featured: boolean;
  actor: UserProfile;
}) {
  try {
    await updateDoc(doc(db, 'releases', params.release.id), {
      featured: params.featured,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: params.actor.uid,
      actorName: params.actor.displayName,
      actorRole: params.actor.role,
      action: params.featured ? 'RELEASE_FEATURED' : 'RELEASE_UNFEATURED',
      entityType: 'releases',
      entityId: params.release.id,
      summary: `${params.featured ? 'Featured' : 'Unfeatured'} "${params.release.title}" on Dashboard Trending Songs.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `releases/${params.release.id}`);
  }
}

export async function cleanupSampleDemoRecords(actor: UserProfile): Promise<{
  removedCount: number;
  preservedCount: number;
}> {
  if (actor.role !== 'super_admin') {
    throw new Error('Only the Super Administrator can run sample/demo cleanup.');
  }
  const { ATTACHED_SUNIL_KUMAR_CATALOG } = await import('../data/attachedCatalog');
  const protectedIds = new Set(ATTACHED_SUNIL_KUMAR_CATALOG.map((i) => i.releaseId));

  const [relSnap, trkSnap, vidSnap, artSnap] = await Promise.all([
    getDocs(query(collection(db, 'releases'), where('distributorLabel', '==', 'Music High Sky'))),
    getDocs(query(collection(db, 'audio_tracks'), where('validated', '==', true))),
    getDocs(query(collection(db, 'video_releases'), where('validated', '==', true))),
    getDocs(
      query(
        collection(db, 'artwork'),
        where('kind', 'in', ['cover_art', 'video_thumbnail', 'promo_banner'])
      )
    ),
  ]);

  const releases = relSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ReleaseRecord, 'id'>),
  }));
  const tracks = trkSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AudioTrackRecord, 'id'>),
  }));
  const videos = vidSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<VideoReleaseRecord, 'id'>),
  }));
  const arts = artSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ArtworkRecord, 'id'>),
  }));

  let removedCount = 0;
  let preservedCount = 0;

  for (const rel of releases) {
    const hasRealTrack = tracks.some(
      (t) =>
        t.releaseId === rel.id &&
        (t.masterSourceUrl?.startsWith('/assets/aistudio/') ||
          t.masterSourceUrl?.includes('firebasestorage.googleapis.com'))
    );
    const hasRealVideo = videos.some(
      (v) =>
        v.releaseId === rel.id &&
        (v.masterSourceUrl?.includes('firebasestorage.googleapis.com') || Boolean(v.driveFileId))
    );

    if (rel.driveFileId || hasRealTrack || hasRealVideo || !isUnmistakableSampleRelease(rel, protectedIds)) {
      preservedCount += 1;
      continue;
    }

    await deleteDoc(doc(db, 'releases', rel.id));
    for (const t of tracks.filter((x) => x.releaseId === rel.id)) {
      await deleteDoc(doc(db, 'audio_tracks', t.id));
    }
    for (const v of videos.filter((x) => x.releaseId === rel.id)) {
      await deleteDoc(doc(db, 'video_releases', v.id));
    }
    for (const a of arts.filter((x) => x.releaseId === rel.id)) {
      await deleteDoc(doc(db, 'artwork', a.id));
    }
    removedCount += 1;
  }

  if (removedCount > 0) {
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'SAMPLE_RECORDS_CLEANED',
      entityType: 'releases',
      summary: `Removed ${removedCount} sample/demo placeholder records while preserving ${preservedCount} genuine releases.`,
    });
  }

  return { removedCount, preservedCount };
}

