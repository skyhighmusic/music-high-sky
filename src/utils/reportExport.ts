import type jsPDF from 'jspdf';
import { BRAND_LOGO_URL } from '../constants';
import type {
  ArtistProfile,
  CopyrightRecord,
  DistributionRecord,
  ReleaseRecord,
  RoyaltyRecord,
} from '../types';

async function loadPdfModules() {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { JsPDF, autoTable };
}

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch(BRAND_LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function createBrandedPdf(title: string, subtitle: string) {
  const { JsPDF, autoTable } = await loadPdfModules();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band in Deep Navy
  doc.setFillColor(8, 14, 31);
  doc.rect(0, 0, pageWidth, 84, 'F');

  // Electric Blue accent hairline
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 84, pageWidth, 2.5, 'F');

  const logo = await loadLogoBase64();
  if (logo) {
    doc.addImage(logo, 'PNG', 34, 14, 56, 56);
  }

  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('MUSIC HIGH SKY', logo ? 104 : 36, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Official Music Distribution & Artist Management — Sunil Kumar', logo ? 104 : 36, 52);

  doc.setTextColor(96, 165, 250);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, logo ? 104 : 36, 70);

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const generatedStr = `Generated: ${new Date().toLocaleString()}`;
  doc.text(generatedStr, pageWidth - 36, 36, { align: 'right' });
  doc.text(subtitle, pageWidth - 36, 52, { align: 'right' });

  return { doc, autoTable };
}

function addPdfFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(34, height - 34, width - 34, height - 34);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Music High Sky | Official Label & Distributor for Sunil Kumar | Verified Label Record',
      34,
      height - 20
    );
    doc.text(`Page ${i} of ${pages}`, width - 34, height - 20, { align: 'right' });
  }
}

export async function exportReleasesPdf(
  releases: ReleaseRecord[],
  reportTitle: string,
  fileName: string
) {
  const { doc, autoTable } = await createBrandedPdf(reportTitle, `${releases.length} Release Record(s)`);
  autoTable(doc, {
    startY: 102,
    head: [
      [
        'Release ID',
        'Title',
        'Type',
        'Artist Credit',
        'Label Credit',
        'Language / Genre',
        'Planned Release',
        'Status',
      ],
    ],
    body: releases.map((r) => [
      r.releaseCode,
      r.title + (r.subtitle ? ` (${r.subtitle})` : ''),
      r.releaseType === 'audio' ? 'Audio Song' : 'Official Video',
      r.artistCredit || r.primaryArtist,
      r.labelCredit || r.distributorLabel,
      `${r.language} / ${r.genre}`,
      r.plannedReleaseDate || 'Unscheduled',
      r.status,
    ]),
    styles: { fontSize: 8.5, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  addPdfFooter(doc);
  doc.save(fileName);
}

export async function exportDistributionPdf(
  records: DistributionRecord[],
  reportTitle: string,
  fileName: string
) {
  const { doc, autoTable } = await createBrandedPdf(reportTitle, `${records.length} DSP Record(s)`);
  autoTable(doc, {
    startY: 102,
    head: [
      [
        'Release Title',
        'Type',
        'DSP Platform',
        'Partner / Aggregator',
        'External Ref ID',
        'Confirmed Date',
        'Status',
      ],
    ],
    body: records.map((r) => [
      r.releaseTitle,
      r.releaseType === 'audio' ? 'Audio' : 'Video',
      r.platformName,
      r.partnerName || 'Not assigned',
      r.externalReferenceId || '—',
      r.deliveryConfirmedDate || 'Pending',
      r.status,
    ]),
    styles: { fontSize: 8.5, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  addPdfFooter(doc);
  doc.save(fileName);
}

export async function exportRoyaltiesPdf(royalties: RoyaltyRecord[], fileName: string) {
  const { doc, autoTable } = await createBrandedPdf(
    'Verified Royalty Statement Report',
    `${royalties.length} Verified Statement Entry(ies)`
  );
  autoTable(doc, {
    startY: 102,
    head: [
      [
        'Period',
        'Release Title',
        'Platform',
        'Territory',
        'Streams',
        'Estimated',
        'Confirmed',
        'Status',
        'Source',
      ],
    ],
    body: royalties.map((r) => [
      r.period,
      r.releaseTitle,
      r.platformName,
      r.territory || 'Global',
      r.streams.toLocaleString(),
      `${r.currency} ${r.estimatedRoyalty.toFixed(2)}`,
      `${r.currency} ${r.confirmedRoyalty.toFixed(2)}`,
      r.paymentStatus,
      r.sourceType,
    ]),
    styles: { fontSize: 8.5, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  addPdfFooter(doc);
  doc.save(fileName);
}

export async function exportCopyrightPdf(records: CopyrightRecord[], fileName: string) {
  const { doc, autoTable } = await createBrandedPdf(
    'Copyright, ISRC, UPC/EAN & Rights Verification Report',
    `${records.length} Rights Record(s)`
  );
  autoTable(doc, {
    startY: 102,
    head: [
      [
        'Release Title',
        'Master Rights',
        'Publishing Rights',
        'ISRC',
        'UPC / EAN',
        'Content ID',
        'Takedown',
        'Admin Verified',
      ],
    ],
    body: records.map((c) => [
      c.releaseTitle,
      c.masterRecordingRights || '—',
      c.publishingRights || '—',
      c.isrc || '—',
      c.upcEan || '—',
      c.contentIdStatus,
      c.takedownStatus,
      c.verifiedByAdmin ? 'Verified' : 'Unverified',
    ]),
    styles: { fontSize: 8.5, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  addPdfFooter(doc);
  doc.save(fileName);
}

export async function exportArtistProfilePdf(
  artist: ArtistProfile,
  releasesCount: number,
  fileName: string
) {
  const { doc, autoTable } = await createBrandedPdf(
    'Official Artist Profile & Label Dossier',
    `Artist: ${artist.name} | Label: ${artist.label}`
  );

  autoTable(doc, {
    startY: 104,
    head: [['Profile Field', 'Official Record']],
    body: [
      ['Artist Name', artist.name],
      ['Official Distributor Label', artist.label],
      ['Professional Identity', artist.professions.join(', ')],
      ['Music Genres', artist.genres.join(', ')],
      ['Primary Languages', artist.languages.join(', ')],
      ['Primary Market / Distribution', `${artist.primaryMarket || 'India'} / ${artist.distributionScope || 'Worldwide'}`],
      ['Total Catalog Releases Submitted', String(releasesCount)],
      ['Spotify Artist Profile', artist.spotifyUrl || 'Not linked yet'],
      ['YouTube Official Channel', artist.youtubeUrl || 'Not linked yet'],
      ['Instagram Profile', artist.instagramUrl || 'Not linked yet'],
      ['Facebook Page', artist.facebookUrl || 'Not linked yet'],
      ['Official Biography', artist.biography],
    ],
    styles: { fontSize: 9, cellPadding: 7 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 200 } },
    headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252] },
  });

  addPdfFooter(doc);
  doc.save(fileName);
}

export async function exportExcelWorkbook(
  sheets: { name: string; rows: Record<string, string | number | boolean>[] }[],
  fileName: string
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const safeRows = sheet.rows.length > 0 ? sheet.rows : [{ Notice: 'No verified records available yet.' }];
    const ws = XLSX.utils.json_to_sheet(safeRows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}

export function downloadVerifiedRoyaltyCsvTemplate() {
  const headers = [
    'period',
    'releaseTitle',
    'platformName',
    'territory',
    'currency',
    'streams',
    'estimatedRoyalty',
    'confirmedRoyalty',
    'paymentStatus',
    'paymentReference',
  ];
  const exampleCommentRow = [
    '2026-10',
    'Replace With Verified Song Title',
    'Spotify',
    'India',
    'INR',
    '0',
    '0.00',
    '0.00',
    'Confirmed',
    'REF-DSP-001',
  ];
  const csv = [headers.join(','), exampleCommentRow.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'music-high-sky-verified-royalty-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export interface ParsedCsvStatementRow {
  period: string;
  releaseTitle: string;
  platformName: string;
  territory: string;
  currency: 'INR' | 'USD';
  streams: number;
  estimatedRoyalty: number;
  confirmedRoyalty: number;
  paymentStatus: 'Estimated' | 'Confirmed' | 'Pending Payment' | 'Paid';
  paymentReference: string;
}

export async function parseVerifiedCsvOrExcel(file: File): Promise<ParsedCsvStatementRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error('The uploaded file contains no readable sheets.');

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('The uploaded report has zero data rows.');
  }

  const parsed: ParsedCsvStatementRow[] = [];
  for (const row of rawRows) {
    const getVal = (...keys: string[]): string => {
      for (const k of keys) {
        for (const rowKey of Object.keys(row)) {
          if (rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, '')) {
            return String(row[rowKey] ?? '').trim();
          }
        }
      }
      return '';
    };

    const period = getVal('period', 'month', 'reportingperiod', 'date');
    const releaseTitle = getVal('releaseTitle', 'songTitle', 'track', 'title', 'song');
    const platformName = getVal('platformName', 'platform', 'dsp', 'store');
    const territory = getVal('territory', 'country', 'region') || 'India';
    const rawCurrency = getVal('currency').toUpperCase();
    const currency: 'INR' | 'USD' = rawCurrency === 'USD' ? 'USD' : 'INR';
    const streams = Math.max(0, Number(getVal('streams', 'plays', 'views', 'quantity')) || 0);
    const estimatedRoyalty = Math.max(0, Number(getVal('estimatedRoyalty', 'estimated', 'gross')) || 0);
    const confirmedRoyalty = Math.max(
      0,
      Number(getVal('confirmedRoyalty', 'confirmed', 'netRoyalty', 'royalty', 'amount')) || 0
    );
    const rawStatus = getVal('paymentStatus', 'status');
    const validStatuses = ['Estimated', 'Confirmed', 'Pending Payment', 'Paid'] as const;
    const paymentStatus = (validStatuses.find(
      (s) => s.toLowerCase() === rawStatus.toLowerCase()
    ) ?? 'Confirmed') as ParsedCsvStatementRow['paymentStatus'];
    const paymentReference = getVal('paymentReference', 'reference', 'ref');

    if (!period || !releaseTitle || !platformName) {
      continue;
    }

    parsed.push({
      period,
      releaseTitle,
      platformName,
      territory,
      currency,
      streams,
      estimatedRoyalty,
      confirmedRoyalty,
      paymentStatus,
      paymentReference,
    });
  }

  if (parsed.length === 0) {
    throw new Error(
      'No valid rows detected. Required columns: period, releaseTitle, platformName, streams, confirmedRoyalty.'
    );
  }

  return parsed;
}
