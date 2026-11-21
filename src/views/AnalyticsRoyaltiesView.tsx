import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Upload, PlusCircle, Download, CheckCircle2, X, Info } from 'lucide-react';
import { STATUS_COLORS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import {
  createVerifiedRoyaltyAndAnalytics,
  updateRoyaltyPaymentStatus,
} from '../services/firestoreService';
import type { RoyaltyRecord } from '../types';
import {
  downloadVerifiedRoyaltyCsvTemplate,
  parseVerifiedCsvOrExcel,
  type ParsedCsvStatementRow,
} from '../utils/reportExport';
import { AnimatedCounter } from '../components/AnimatedCounter';

interface AnalyticsRoyaltiesViewProps {
  mode: 'analytics' | 'royalties';
}

const CHART_COLORS = ['#00A8FF', '#00D5FF', '#D4AF37', '#0759C7', '#F5D58A', '#38BDF8'];

export const AnalyticsRoyaltiesView: React.FC<AnalyticsRoyaltiesViewProps> = ({ mode }) => {
  const { currentUser, releases, platforms, royalties, analytics, settings, pushToast } =
    usePlatform();

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [showManualModal, setShowManualModal] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState<ParsedCsvStatementRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [importing, setImporting] = useState(false);

  // Manual verified entry form state
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [releaseTitle, setReleaseTitle] = useState('');
  const [platformName, setPlatformName] = useState('Spotify');
  const [territory, setTerritory] = useState('India');
  const [currency, setCurrency] = useState<'INR' | 'USD'>(settings.defaultCurrency || 'INR');
  const [streams, setStreams] = useState('0');
  const [estimatedRoyalty, setEstimatedRoyalty] = useState('0');
  const [confirmedRoyalty, setConfirmedRoyalty] = useState('0');
  const [paymentStatus, setPaymentStatus] =
    useState<RoyaltyRecord['paymentStatus']>('Confirmed');
  const [paymentReference, setPaymentReference] = useState('');
  const [sourceReportName, setSourceReportName] = useState('');

  // Payout update modal
  const [payoutTarget, setPayoutTarget] = useState<RoyaltyRecord | null>(null);
  const [payoutStatus, setPayoutStatus] = useState<RoyaltyRecord['paymentStatus']>('Paid');
  const [payoutRef, setPayoutRef] = useState('');
  const [payoutDate, setPayoutDate] = useState(() => new Date().toISOString().slice(0, 10));

  const totals = useMemo(() => {
    const totalStreams = analytics.reduce((acc, a) => acc + (a.streams || 0), 0);
    const est = royalties.reduce((acc, r) => acc + (r.estimatedRoyalty || 0), 0);
    const conf = royalties.reduce((acc, r) => acc + (r.confirmedRoyalty || 0), 0);
    const pending = royalties
      .filter((r) => r.paymentStatus === 'Pending Payment' || r.paymentStatus === 'Confirmed')
      .reduce((acc, r) => acc + (r.confirmedRoyalty || 0), 0);
    const paid = royalties
      .filter((r) => r.paymentStatus === 'Paid')
      .reduce((acc, r) => acc + (r.confirmedRoyalty || 0), 0);
    return { totalStreams, est, conf, pending, paid };
  }, [analytics, royalties]);

  const monthlySeries = useMemo(() => {
    const map: Record<string, { period: string; streams: number; royalty: number }> = {};
    for (const a of analytics) {
      if (!map[a.period]) map[a.period] = { period: a.period, streams: 0, royalty: 0 };
      map[a.period].streams += a.streams || 0;
    }
    for (const r of royalties) {
      if (!map[r.period]) map[r.period] = { period: r.period, streams: 0, royalty: 0 };
      map[r.period].royalty += r.confirmedRoyalty || 0;
    }
    return Object.values(map).sort((a, b) => a.period.localeCompare(b.period));
  }, [analytics, royalties]);

  const platformSeries = useMemo(() => {
    const map: Record<string, { name: string; streams: number; royalty: number }> = {};
    for (const a of analytics) {
      if (!map[a.platformName]) map[a.platformName] = { name: a.platformName, streams: 0, royalty: 0 };
      map[a.platformName].streams += a.streams || 0;
    }
    for (const r of royalties) {
      if (!map[r.platformName]) map[r.platformName] = { name: r.platformName, streams: 0, royalty: 0 };
      map[r.platformName].royalty += r.confirmedRoyalty || 0;
    }
    return Object.values(map).sort((a, b) => b.streams - a.streams);
  }, [analytics, royalties]);

  const topSongs = useMemo(() => {
    const map: Record<string, { title: string; streams: number; royalty: number }> = {};
    for (const a of analytics) {
      if (!map[a.releaseTitle]) map[a.releaseTitle] = { title: a.releaseTitle, streams: 0, royalty: 0 };
      map[a.releaseTitle].streams += a.streams || 0;
    }
    for (const r of royalties) {
      if (!map[r.releaseTitle]) map[r.releaseTitle] = { title: r.releaseTitle, streams: 0, royalty: 0 };
      map[r.releaseTitle].royalty += r.confirmedRoyalty || 0;
    }
    return Object.values(map).sort((a, b) => b.streams - a.streams);
  }, [analytics, royalties]);

  const geoSeries = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of analytics) {
      map[a.territory] = (map[a.territory] || 0) + (a.streams || 0);
    }
    return Object.entries(map)
      .map(([territoryName, count]) => ({ territory: territoryName, streams: count }))
      .sort((a, b) => b.streams - a.streams);
  }, [analytics]);

  const handleCsvPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseVerifiedCsvOrExcel(file);
      setCsvPreviewRows(rows);
      setCsvFileName(file.name);
      pushToast(`Parsed ${rows.length} verified statement row(s) from ${file.name}.`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to parse report file.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreviewRows || !currentUser || !isSuperAdmin) return;
    setImporting(true);
    try {
      await createVerifiedRoyaltyAndAnalytics({
        entries: csvPreviewRows.map((row) => ({
          period: row.period,
          releaseId:
            releases.find((r) => r.title.toLowerCase() === row.releaseTitle.toLowerCase())?.id || '',
          releaseTitle: row.releaseTitle,
          platformName: row.platformName,
          territory: row.territory,
          currency: row.currency,
          streams: row.streams,
          estimatedRoyalty: row.estimatedRoyalty,
          confirmedRoyalty: row.confirmedRoyalty,
          paymentStatus: row.paymentStatus,
          paymentReference: row.paymentReference,
          paidDate: '',
          sourceType: 'CSV Import',
          sourceReportName: csvFileName,
        })),
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast(`Imported ${csvPreviewRows.length} verified statement row(s) to Firestore.`, 'success');
      setCsvPreviewRows(null);
      setCsvFileName('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'CSV import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isSuperAdmin) return;
    if (!releaseTitle.trim() || !period.trim()) {
      pushToast('Enter a reporting period and song title.', 'error');
      return;
    }
    setImporting(true);
    try {
      const matchedRel = releases.find(
        (r) => r.title.toLowerCase() === releaseTitle.trim().toLowerCase()
      );
      await createVerifiedRoyaltyAndAnalytics({
        entries: [
          {
            period: period.trim(),
            releaseId: matchedRel?.id || '',
            releaseTitle: releaseTitle.trim(),
            platformName,
            territory: territory.trim() || 'India',
            currency,
            streams: Math.max(0, Number(streams) || 0),
            estimatedRoyalty: Math.max(0, Number(estimatedRoyalty) || 0),
            confirmedRoyalty: Math.max(0, Number(confirmedRoyalty) || 0),
            paymentStatus,
            paymentReference: paymentReference.trim(),
            paidDate: paymentStatus === 'Paid' ? new Date().toISOString().slice(0, 10) : '',
            sourceType: 'Manual Verified Entry',
            sourceReportName: sourceReportName.trim() || 'Verified Label Statement',
          },
        ],
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast('Verified royalty & analytics record saved.', 'success');
      setShowManualModal(false);
      setReleaseTitle('');
      setStreams('0');
      setEstimatedRoyalty('0');
      setConfirmedRoyalty('0');
      setPaymentReference('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save verified statement.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleSavePayoutStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutTarget || !currentUser || !isSuperAdmin) return;
    setImporting(true);
    try {
      await updateRoyaltyPaymentStatus({
        royalty: payoutTarget,
        paymentStatus: payoutStatus,
        paymentReference: payoutRef,
        paidDate: payoutDate,
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast(`Payout status updated to ${payoutStatus}.`, 'success');
      setPayoutTarget(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Payout update failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const curSymbol = (settings.defaultCurrency || 'INR') === 'USD' ? '$' : '₹';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Music High Sky · Verified DSP Reporting
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            {mode === 'analytics' ? 'Music Analytics' : 'Royalties & Payments'}
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1">
            {mode === 'analytics'
              ? 'Platform-wise streams, monthly growth, top songs, and geographic listener performance from verified distributor reports.'
              : 'Track estimated royalties, confirmed distributor earnings, pending payouts, and settled artist payments.'}
          </p>
        </div>

        {isSuperAdmin && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={downloadVerifiedRoyaltyCsvTemplate}
              className="btn-electric inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV Template
            </button>

            <label className="btn-electric inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV / Excel</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleCsvPick}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowManualModal(true)}
              className="btn-gold inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              Log Verified Entry
            </button>
          </div>
        )}
      </div>

      {/* Zero Fictional Figures Policy Banner */}
      <div className="p-4 rounded-2xl luxury-card flex items-start gap-3 text-xs text-[#C8D0DB]">
        <Info className="w-4 h-4 text-[#00D5FF] shrink-0 mt-0.5" />
        <p>
          All stream counts and financial totals are derived strictly from verified DSP CSV/Excel statements or administrator-logged distributor reports. Zero fictional metrics are synthesized.
        </p>
      </div>

      {/* Luxury Financial & Streaming KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="luxury-card luxury-card-hover rounded-2xl p-4 sm:p-5 space-y-2 border-[#00A8FF]/30">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8D9AAA] block">
            Total Verified Streams
          </span>
          <span className="text-2xl font-bold font-mono text-[#00D5FF] block">
            <AnimatedCounter value={totals.totalStreams} />
          </span>
        </div>
        <div className="luxury-card luxury-card-hover rounded-2xl p-4 sm:p-5 space-y-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8D9AAA] block">
            Estimated Royalties
          </span>
          <span className="text-2xl font-bold font-mono text-white block">
            <AnimatedCounter value={totals.est} prefix={curSymbol} decimals={2} />
          </span>
        </div>
        <div className="luxury-card luxury-card-hover rounded-2xl p-4 sm:p-5 space-y-2 border-[#D4AF37]/40">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#F5D58A] block">
            Confirmed Royalties
          </span>
          <span className="text-2xl font-bold font-mono text-[#F5D58A] block">
            <AnimatedCounter value={totals.conf} prefix={curSymbol} decimals={2} />
          </span>
        </div>
        <div className="luxury-card luxury-card-hover rounded-2xl p-4 sm:p-5 space-y-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8D9AAA] block">
            Pending Payments
          </span>
          <span className="text-2xl font-bold font-mono text-[#D4AF37] block">
            <AnimatedCounter value={totals.pending} prefix={curSymbol} decimals={2} />
          </span>
        </div>
        <div className="luxury-card luxury-card-hover rounded-2xl p-4 sm:p-5 space-y-2 col-span-2 lg:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8D9AAA] block">
            Paid Royalties
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-400 block">
            <AnimatedCounter value={totals.paid} prefix={curSymbol} decimals={2} />
          </span>
        </div>
      </section>

      {/* CSV Preview Approval Bar */}
      {csvPreviewRows && (
        <section className="luxury-card border-[#00A8FF]/55 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                Review Parsed Report: {csvFileName}
              </h3>
              <p className="text-xs text-[#C8D0DB]">
                {csvPreviewRows.length} verified row(s) ready to commit to Cloud Firestore royalties &amp; analytics.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCsvPreviewRows(null)}
                className="px-3 py-1.5 text-xs text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={handleConfirmCsvImport}
                className="btn-gold inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {importing ? 'Importing...' : `Import ${csvPreviewRows.length} Rows`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-56">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#F5D58A] border-b border-[#D4AF37]/20">
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3">Release</th>
                  <th className="py-2 pr-3">Platform</th>
                  <th className="py-2 pr-3">Territory</th>
                  <th className="py-2 pr-3 text-right">Streams</th>
                  <th className="py-2 text-right">Confirmed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4AF37]/12">
                {csvPreviewRows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-mono text-[#C8D0DB]">{row.period}</td>
                    <td className="py-2 pr-3 text-white font-medium">{row.releaseTitle}</td>
                    <td className="py-2 pr-3 text-[#C8D0DB]">{row.platformName}</td>
                    <td className="py-2 pr-3 text-[#8D9AAA]">{row.territory}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-[#00D5FF]">
                      {row.streams.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#F5D58A]">
                      {row.currency} {row.confirmedRoyalty.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Charts or Clean Empty State */}
      {monthlySeries.length === 0 ? (
        <section className="luxury-card rounded-2xl p-12 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-[#F5D58A]">
            No Verified DSP Statements Imported Yet
          </p>
          <p className="text-xs text-[#C8D0DB] max-w-lg mx-auto leading-relaxed">
            Monthly trend charts, platform breakdowns, geographic distribution, and royalty statements will populate automatically once you import a verified distributor CSV/Excel report or log a verified statement entry.
          </p>
          {isSuperAdmin && (
            <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={downloadVerifiedRoyaltyCsvTemplate}
                className="btn-electric px-4 py-2.5 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Download CSV Template
              </button>
              <button
                type="button"
                onClick={() => setShowManualModal(true)}
                className="btn-gold px-5 py-2.5 text-xs font-bold rounded-xl cursor-pointer"
              >
                Log First Verified Report
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 luxury-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                  {mode === 'analytics' ? 'Monthly Verified Streams' : 'Monthly Confirmed Royalties'}
                </h3>
                <p className="text-xs text-[#8D9AAA]">Aggregated by verified reporting period</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlySeries}>
                    <defs>
                      <linearGradient id="mhsElectricGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00A8FF" stopOpacity={0.42} />
                        <stop offset="95%" stopColor="#00A8FF" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(212,175,55,0.12)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" stroke="#8D9AAA" fontSize={11} />
                    <YAxis stroke="#8D9AAA" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#06152E',
                        borderColor: 'rgba(212,175,55,0.45)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        color: '#FFFFFF',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={mode === 'analytics' ? 'streams' : 'royalty'}
                      stroke="#00D5FF"
                      strokeWidth={2.5}
                      fill="url(#mhsElectricGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="lg:col-span-5 luxury-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                  Platform-Wise Distribution
                </h3>
                <p className="text-xs text-[#8D9AAA]">Verified share across streaming stores</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platformSeries.slice(0, 8)} layout="vertical">
                    <CartesianGrid stroke="rgba(212,175,55,0.12)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" stroke="#8D9AAA" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="#C8D0DB" fontSize={11} width={92} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#06152E',
                        borderColor: 'rgba(212,175,55,0.45)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        color: '#FFFFFF',
                      }}
                    />
                    <Bar dataKey={mode === 'analytics' ? 'streams' : 'royalty'} radius={[0, 6, 6, 0]}>
                      {platformSeries.slice(0, 8).map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {mode === 'analytics' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="luxury-card rounded-2xl p-5 sm:p-6 space-y-3">
                <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                  Top Performing Songs
                </h3>
                <div className="divide-y divide-[#D4AF37]/15 text-xs">
                  {topSongs.slice(0, 8).map((s, idx) => (
                    <div key={s.title} className="py-3 flex items-center justify-between gap-3">
                      <span className="text-white font-medium truncate">
                        <span className="text-[#D4AF37] font-mono mr-2">0{idx + 1}.</span>
                        {s.title}
                      </span>
                      <span className="font-mono tabular-nums text-[#00D5FF] shrink-0">
                        {s.streams.toLocaleString()} streams
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="luxury-card rounded-2xl p-5 sm:p-6 space-y-3">
                <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                  Geographic Performance
                </h3>
                <div className="divide-y divide-[#D4AF37]/15 text-xs">
                  {geoSeries.slice(0, 8).map((g) => (
                    <div key={g.territory} className="py-3 flex items-center justify-between gap-3">
                      <span className="text-white">{g.territory}</span>
                      <span className="font-mono tabular-nums text-[#F5D58A]">
                        {g.streams.toLocaleString()} streams
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <section className="luxury-card rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-[#D4AF37]/20">
                <h3 className="font-display text-base font-semibold text-[#F5D58A]">
                  Verified Royalty Ledger
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#D4AF37]/20 bg-[#030509]/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F5D58A]">
                      <th className="py-3.5 px-4">Period</th>
                      <th className="py-3.5 px-4">Release</th>
                      <th className="py-3.5 px-4">Platform</th>
                      <th className="py-3.5 px-4 text-right">Streams</th>
                      <th className="py-3.5 px-4 text-right">Confirmed</th>
                      <th className="py-3.5 px-4">Source</th>
                      <th className="py-3.5 px-4">Payment Status</th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D4AF37]/12">
                    {royalties.map((r) => {
                      const tone = STATUS_COLORS[r.paymentStatus] ?? { text: 'text-[#C8D0DB]', dot: 'bg-[#C8D0DB]' };
                      return (
                        <tr key={r.id} className="hover:bg-[#06152E]/60 transition-colors">
                          <td className="py-3.5 px-4 font-mono tabular-nums text-[#C8D0DB]">{r.period}</td>
                          <td className="py-3.5 px-4 font-semibold text-white">{r.releaseTitle}</td>
                          <td className="py-3.5 px-4 text-[#C8D0DB]">{r.platformName}</td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#00D5FF]">
                            {r.streams.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F5D58A] font-semibold">
                            {r.currency} {r.confirmedRoyalty.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-[#8D9AAA]">{r.sourceType}</td>
                          <td className={`py-3.5 px-4 font-semibold ${tone.text}`}>
                            {r.paymentStatus}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayoutTarget(r);
                                  setPayoutStatus(r.paymentStatus);
                                  setPayoutRef(r.paymentReference || '');
                                  setPayoutDate(r.paidDate || new Date().toISOString().slice(0, 10));
                                }}
                                className="btn-electric px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer"
                              >
                                Update Payout
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Manual Verified Statement Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-[#020817]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleManualSubmit}
            className="luxury-card border-[#D4AF37]/40 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3.5">
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">
                Log Verified DSP Statement Entry
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Reporting Month (YYYY-MM) *</label>
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Song / Release Title *</label>
                <input
                  type="text"
                  list="mhs-releases-datalist"
                  value={releaseTitle}
                  onChange={(e) => setReleaseTitle(e.target.value)}
                  placeholder="Select or enter title"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
                <datalist id="mhs-releases-datalist">
                  {releases.map((r) => (
                    <option key={r.id} value={r.title} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">DSP Platform</label>
                <select
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  {platforms.map((p) => (
                    <option key={p.id} value={p.name} className="bg-[#06152E]">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Territory / Country</label>
                <input
                  type="text"
                  value={territory}
                  onChange={(e) => setTerritory(e.target.value)}
                  placeholder="India, USA, UK..."
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Verified Streams / Views</label>
                <input
                  type="number"
                  min={0}
                  value={streams}
                  onChange={(e) => setStreams(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="INR" className="bg-[#06152E]">INR (₹)</option>
                  <option value="USD" className="bg-[#06152E]">USD ($)</option>
                </select>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Estimated Royalty</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={estimatedRoyalty}
                  onChange={(e) => setEstimatedRoyalty(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Confirmed Royalty</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={confirmedRoyalty}
                  onChange={(e) => setConfirmedRoyalty(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(e.target.value as RoyaltyRecord['paymentStatus'])
                  }
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="Estimated" className="bg-[#06152E]">Estimated</option>
                  <option value="Confirmed" className="bg-[#06152E]">Confirmed</option>
                  <option value="Pending Payment" className="bg-[#06152E]">Pending Payment</option>
                  <option value="Paid" className="bg-[#06152E]">Paid</option>
                </select>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Source Statement Reference</label>
                <input
                  type="text"
                  value={sourceReportName}
                  onChange={(e) => setSourceReportName(e.target.value)}
                  placeholder="e.g. Oct 2026 Partner Statement"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[#C8D0DB] mb-1.5">
                  Payment / UTR Reference (Optional)
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="NEFT / Bank Transfer / Gateway Reference"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing}
                className="btn-gold px-5 py-2.5 font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {importing ? 'Saving...' : 'Save Verified Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payout Status Modal */}
      {payoutTarget && (
        <div className="fixed inset-0 z-50 bg-[#020817]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePayoutStatus}
            className="luxury-card border-[#D4AF37]/40 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3.5">
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">Update Payout Status</h3>
              <button
                type="button"
                onClick={() => setPayoutTarget(null)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[#C8D0DB]">
              <strong className="text-white">{payoutTarget.releaseTitle}</strong> ·{' '}
              {payoutTarget.platformName} ({payoutTarget.period})
            </p>

            <div>
              <label className="block text-[#C8D0DB] mb-1.5">Payment Status</label>
              <select
                value={payoutStatus}
                onChange={(e) => setPayoutStatus(e.target.value as RoyaltyRecord['paymentStatus'])}
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
              >
                <option value="Estimated" className="bg-[#06152E]">Estimated</option>
                <option value="Confirmed" className="bg-[#06152E]">Confirmed</option>
                <option value="Pending Payment" className="bg-[#06152E]">Pending Payment</option>
                <option value="Paid" className="bg-[#06152E]">Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-[#C8D0DB] mb-1.5">Payment Gateway / Bank Ref ID</label>
              <input
                type="text"
                value={payoutRef}
                onChange={(e) => setPayoutRef(e.target.value)}
                placeholder="UTR / Wire / Gateway ID"
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-[#C8D0DB] mb-1.5">Settlement Date</label>
              <input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setPayoutTarget(null)}
                className="px-4 py-2 text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing}
                className="btn-gold px-5 py-2.5 font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {importing ? 'Updating...' : 'Save Payment Status'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
