import React from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import {
  exportArtistProfilePdf,
  exportCopyrightPdf,
  exportDistributionPdf,
  exportExcelWorkbook,
  exportReleasesPdf,
  exportRoyaltiesPdf,
} from '../utils/reportExport';

export const DocumentsReportsView: React.FC = () => {
  const {
    artist,
    releases,
    distributionRecords,
    royalties,
    copyrightRecords,
    pushToast,
  } = usePlatform();

  const audioReleases = releases.filter((r) => r.releaseType === 'audio');
  const videoReleases = releases.filter((r) => r.releaseType === 'video');
  const audioDist = distributionRecords.filter((d) => d.releaseType === 'audio');
  const videoDist = distributionRecords.filter((d) => d.releaseType === 'video');

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const monthlyReleases = releases.filter(
    (r) => r.submissionDate?.startsWith(currentMonth) || r.plannedReleaseDate?.startsWith(currentMonth)
  );

  const reportCards = [
    {
      title: 'Music Release Catalog Report',
      description: 'Complete master catalog of audio and video releases with credits, dates, and workflow status.',
      count: `${releases.length} releases`,
      onPdf: async () => {
        await exportReleasesPdf(
          releases,
          'Complete Music Release Catalog Report',
          `Music-High-Sky-Releases-${today}.pdf`
        );
        pushToast('Branded Music Release PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: 'All Releases',
              rows: releases.map((r) => ({
                ReleaseID: r.releaseCode,
                Title: r.title,
                Type: r.releaseType,
                ArtistCredit: r.artistCredit,
                LabelCredit: r.labelCredit,
                Genre: r.genre,
                Language: r.language,
                SubmissionDate: r.submissionDate,
                PlannedReleaseDate: r.plannedReleaseDate || '',
                Status: r.status,
              })),
            },
          ],
          `Music-High-Sky-Releases-${today}.xlsx`
        );
        pushToast('Excel Release Report exported.', 'success');
      },
    },
    {
      title: 'Audio Distribution Report',
      description: 'Per-DSP partner submission and confirmed delivery ledger for all Audio Song releases.',
      count: `${audioDist.length} DSP records (${audioReleases.length} tracks)`,
      onPdf: async () => {
        await exportDistributionPdf(
          audioDist,
          'Audio Music Distribution Report',
          `Music-High-Sky-Audio-Distribution-${today}.pdf`
        );
        pushToast('Branded Audio Distribution PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: 'Audio Distribution',
              rows: audioDist.map((d) => ({
                Release: d.releaseTitle,
                Platform: d.platformName,
                Partner: d.partnerName || '',
                ExternalRefID: d.externalReferenceId || '',
                ConfirmedDate: d.deliveryConfirmedDate || '',
                Status: d.status,
                LiveURL: d.liveUrl || '',
              })),
            },
          ],
          `Music-High-Sky-Audio-Distribution-${today}.xlsx`
        );
        pushToast('Excel Audio Distribution Report exported.', 'success');
      },
    },
    {
      title: 'Video Distribution Report',
      description: 'Official Music Video delivery status across YouTube, YouTube Music, Facebook, and Instagram.',
      count: `${videoDist.length} DSP records (${videoReleases.length} videos)`,
      onPdf: async () => {
        await exportDistributionPdf(
          videoDist,
          'Official Video Distribution Report',
          `Music-High-Sky-Video-Distribution-${today}.pdf`
        );
        pushToast('Branded Video Distribution PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: 'Video Distribution',
              rows: videoDist.map((d) => ({
                Release: d.releaseTitle,
                Platform: d.platformName,
                Partner: d.partnerName || '',
                ExternalRefID: d.externalReferenceId || '',
                ConfirmedDate: d.deliveryConfirmedDate || '',
                Status: d.status,
                LiveURL: d.liveUrl || '',
              })),
            },
          ],
          `Music-High-Sky-Video-Distribution-${today}.xlsx`
        );
        pushToast('Excel Video Distribution Report exported.', 'success');
      },
    },
    {
      title: 'Monthly Release Summary',
      description: `Focused executive summary of submissions and scheduled launches for ${currentMonth}.`,
      count: `${monthlyReleases.length} release(s) in ${currentMonth}`,
      onPdf: async () => {
        await exportReleasesPdf(
          monthlyReleases.length > 0 ? monthlyReleases : releases,
          `Monthly Release Summary (${currentMonth})`,
          `Music-High-Sky-Monthly-Summary-${currentMonth}.pdf`
        );
        pushToast('Monthly Release Summary PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: `Summary ${currentMonth}`,
              rows: (monthlyReleases.length > 0 ? monthlyReleases : releases).map((r) => ({
                ReleaseID: r.releaseCode,
                Title: r.title,
                Type: r.releaseType,
                PlannedRelease: r.plannedReleaseDate || '',
                Status: r.status,
              })),
            },
          ],
          `Music-High-Sky-Monthly-Summary-${currentMonth}.xlsx`
        );
        pushToast('Monthly Excel Summary exported.', 'success');
      },
    },
    {
      title: 'Verified Royalty Statements',
      description: 'Export verified DSP streams, estimated & confirmed earnings, and payout settlement references.',
      count: `${royalties.length} verified statement rows`,
      onPdf: async () => {
        await exportRoyaltiesPdf(royalties, `Music-High-Sky-Royalties-${today}.pdf`);
        pushToast('Branded Royalty Statement PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: 'Royalties',
              rows: royalties.map((r) => ({
                Period: r.period,
                Release: r.releaseTitle,
                Platform: r.platformName,
                Territory: r.territory || 'India',
                Streams: r.streams,
                Currency: r.currency,
                EstimatedRoyalty: r.estimatedRoyalty,
                ConfirmedRoyalty: r.confirmedRoyalty,
                PaymentStatus: r.paymentStatus,
                PaymentReference: r.paymentReference || '',
                Source: r.sourceType,
              })),
            },
          ],
          `Music-High-Sky-Royalties-${today}.xlsx`
        );
        pushToast('Excel Royalty Statement exported.', 'success');
      },
    },
    {
      title: 'Artist Profile Report — Sunil Kumar',
      description: 'Official Music High Sky artist dossier with biography, genres, languages, and DSP profile links.',
      count: artist.name,
      onPdf: async () => {
        await exportArtistProfilePdf(
          artist,
          releases.length,
          `Music-High-Sky-Artist-Profile-${today}.pdf`
        );
        pushToast('Branded Artist Profile PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: 'Artist Profile',
              rows: [
                { Field: 'Artist Name', Value: artist.name },
                { Field: 'Label', Value: artist.label },
                { Field: 'Professions', Value: artist.professions.join(', ') },
                { Field: 'Genres', Value: artist.genres.join(', ') },
                { Field: 'Languages', Value: artist.languages.join(', ') },
                { Field: 'Primary Market', Value: artist.primaryMarket || 'India' },
                { Field: 'Spotify', Value: artist.spotifyUrl || '' },
                { Field: 'YouTube', Value: artist.youtubeUrl || '' },
                { Field: 'Instagram', Value: artist.instagramUrl || '' },
                { Field: 'Facebook', Value: artist.facebookUrl || '' },
                { Field: 'Biography', Value: artist.biography },
              ],
            },
          ],
          `Music-High-Sky-Artist-Profile-${today}.xlsx`
        );
        pushToast('Excel Artist Profile exported.', 'success');
      },
    },
    {
      title: 'Copyright & Metadata Report',
      description: 'Verified ownership splits, master & publishing rights, ISRC, UPC/EAN, and Content ID registry.',
      count: `${copyrightRecords.length} rights records`,
      onPdf: async () => {
        await exportCopyrightPdf(copyrightRecords, `Music-High-Sky-Copyright-${today}.pdf`);
        pushToast('Branded Copyright & Metadata PDF generated.', 'success');
      },
      onExcel: async () => {
        await exportExcelWorkbook(
          [
            {
              name: 'Copyright Registry',
              rows: copyrightRecords.map((c) => ({
                ReleaseTitle: c.releaseTitle,
                SongOwnership: c.songOwnership || '',
                MasterRights: c.masterRecordingRights || '',
                PublishingRights: c.publishingRights || '',
                ISRC: c.isrc || '',
                UPC_EAN: c.upcEan || '',
                ContentID: c.contentIdStatus,
                Takedown: c.takedownStatus,
                AdminVerified: c.verifiedByAdmin,
              })),
            },
          ],
          `Music-High-Sky-Copyright-${today}.xlsx`
        );
        pushToast('Excel Copyright Report exported.', 'success');
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
          Music High Sky · Branded Label Documentation
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
          Documents &amp; Reports
        </h2>
        <p className="text-sm text-[#C8D0DB] mt-1">
          Generate downloadable PDF reports stamped with the official Music High Sky emblem and structured Excel (.xlsx) workbooks directly from live database records.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {reportCards.map((card) => (
          <article
            key={card.title}
            className="luxury-card luxury-card-hover rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5"
          >
            <div className="space-y-2">
              <h3 className="font-display text-base font-bold text-[#F5D58A] leading-snug">
                {card.title}
              </h3>
              <p className="text-xs text-[#C8D0DB] leading-relaxed">{card.description}</p>
              <p className="text-[11px] font-mono text-[#00D5FF] pt-1">{card.count}</p>
            </div>

            <div className="flex items-center gap-2.5 pt-4 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={card.onPdf}
                className="btn-gold flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={card.onExcel}
                className="btn-electric flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Excel
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
