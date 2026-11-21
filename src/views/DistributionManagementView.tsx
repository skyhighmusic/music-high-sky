import React, { useMemo, useState } from 'react';
import { Edit3, ExternalLink, Info, Save, X, Search } from 'lucide-react';
import { DISTRIBUTION_STATUSES, STATUS_COLORS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import { updateDistributionRecordItem } from '../services/firestoreService';
import type { DistributionRecord, DistributionStatus } from '../types';

export const DistributionManagementView: React.FC = () => {
  const { currentUser, distributionRecords, releases, settings, pushToast } = usePlatform();

  const [releaseFilter, setReleaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DistributionStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [editing, setEditing] = useState<DistributionRecord | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [externalReferenceId, setExternalReferenceId] = useState('');
  const [status, setStatus] = useState<DistributionStatus>('Planned');
  const [deliveryConfirmedDate, setDeliveryConfirmedDate] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isStaff = currentUser?.role === 'super_admin' || currentUser?.role === 'label_manager';

  const openEditor = (rec: DistributionRecord) => {
    setEditing(rec);
    setPartnerName(rec.partnerName || '');
    setExternalReferenceId(rec.externalReferenceId || '');
    setStatus(rec.status);
    setDeliveryConfirmedDate(rec.deliveryConfirmedDate || '');
    setLiveUrl(rec.liveUrl || '');
    setEvidenceNotes(rec.evidenceNotes || '');
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return distributionRecords.filter((rec) => {
      if (releaseFilter !== 'all' && rec.releaseId !== releaseFilter) return false;
      if (statusFilter !== 'all' && rec.status !== statusFilter) return false;
      if (!q) return true;
      return (
        rec.releaseTitle.toLowerCase().includes(q) ||
        rec.platformName.toLowerCase().includes(q) ||
        (rec.partnerName || '').toLowerCase().includes(q) ||
        (rec.externalReferenceId || '').toLowerCase().includes(q)
      );
    });
  }, [distributionRecords, releaseFilter, statusFilter, searchTerm]);

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !currentUser) return;
    if ((status === 'Delivered' || status === 'Live') && !externalReferenceId.trim()) {
      pushToast(
        'Enter the confirmed Partner / Aggregator Reference ID before marking a track Delivered or Live.',
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      await updateDistributionRecordItem({
        record: editing,
        partnerName,
        externalReferenceId,
        status,
        deliveryConfirmedDate,
        liveUrl,
        evidenceNotes,
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast(`Updated ${editing.platformName} delivery record for "${editing.releaseTitle}".`, 'success');
      setEditing(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to update distribution record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
          Music High Sky · Transparent Partner Workflow
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
          Distribution Management
        </h2>
        <p className="text-sm text-[#C8D0DB] mt-1">
          Track authorized distributor submissions, external delivery reference IDs, confirmation dates, and verified live DSP links.
        </p>
      </div>

      {/* Compliance / Honesty Policy Notice */}
      <div className="p-4 rounded-2xl luxury-card flex items-start gap-3 text-xs text-[#C8D0DB]">
        <Info className="w-4 h-4 text-[#00D5FF] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#F5D58A]">Verified Delivery Standard:</strong> Music High Sky never fabricates direct DSP delivery or live store statuses. Each DSP row begins as <span className="font-mono text-white">Planned</span> and advances to <span className="font-mono text-[#00D5FF]">Delivered</span> or <span className="font-mono text-emerald-400">Live</span> only when a Label Manager or Super Administrator logs confirmed partner delivery evidence and an external reference ID.
        </p>
      </div>

      {/* Filters & Distribution Ledger */}
      <div className="luxury-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#D4AF37]/20 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#8D9AAA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search song, DSP, partner, or reference ID..."
              className="w-full pl-9 pr-3 py-2.5 text-xs luxury-input rounded-lg"
            />
          </div>

          <select
            value={releaseFilter}
            onChange={(e) => setReleaseFilter(e.target.value)}
            aria-label="Filter by release"
            className="px-3.5 py-2.5 text-xs luxury-input rounded-lg"
          >
            <option value="all" className="bg-[#06152E]">All Releases</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id} className="bg-[#06152E]">
                {r.releaseCode} — {r.title}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | DistributionStatus)}
            aria-label="Filter by DSP delivery status"
            className="px-3.5 py-2.5 text-xs luxury-input rounded-lg"
          >
            <option value="all" className="bg-[#06152E]">All Delivery Statuses</option>
            {DISTRIBUTION_STATUSES.map((st) => (
              <option key={st} value={st} className="bg-[#06152E]">
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#D4AF37]/20 bg-[#030509]/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F5D58A]">
                <th className="py-3.5 px-4 whitespace-nowrap">Release</th>
                <th className="py-3.5 px-4 whitespace-nowrap">DSP Platform</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Partner / Aggregator</th>
                <th className="py-3.5 px-4 whitespace-nowrap">External Ref ID</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Confirmed Date</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4AF37]/12 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center text-[#8D9AAA]">
                    No distribution records found. Submit a release to automatically initialize transparent DSP tracking rows.
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => {
                  const tone = STATUS_COLORS[rec.status] ?? { text: 'text-[#C8D0DB]', dot: 'bg-[#C8D0DB]' };
                  return (
                    <tr key={rec.id} className="hover:bg-[#06152E]/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-white">{rec.releaseTitle}</p>
                        <p className="text-[11px] text-[#8D9AAA] capitalize">{rec.releaseType}</p>
                      </td>
                      <td className="py-3.5 px-4 text-white font-medium whitespace-nowrap">
                        {rec.platformName}
                      </td>
                      <td className="py-3.5 px-4 text-[#C8D0DB] whitespace-nowrap">
                        {rec.partnerName || 'Not assigned'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#00D5FF] whitespace-nowrap">
                        {rec.externalReferenceId || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#8D9AAA] whitespace-nowrap">
                        {rec.deliveryConfirmedDate || 'Pending'}
                      </td>
                      <td className={`py-3.5 px-4 font-semibold whitespace-nowrap ${tone.text}`}>
                        {rec.status}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {rec.liveUrl && (
                            <a
                              href={rec.liveUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-[#00D5FF] hover:text-[#F5D58A] transition-colors"
                              title="Open verified store link"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {isStaff && (
                            <button
                              type="button"
                              onClick={() => openEditor(rec)}
                              className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Update
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Partner Delivery Confirmation Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-[#020817]/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRecord}
            className="luxury-card border-[#D4AF37]/40 rounded-2xl max-w-lg w-full p-6 space-y-5 text-xs"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#D4AF37]/20 pb-3.5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#00D5FF] font-semibold">
                  {editing.platformName}
                </p>
                <h3 className="font-display text-lg font-bold text-[#F5D58A] mt-0.5">
                  {editing.releaseTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Authorized Partner / Aggregator</label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="e.g. Believe, FUGA, The Orchard, Direct CMS"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">External Distribution Ref ID</label>
                <input
                  type="text"
                  value={externalReferenceId}
                  onChange={(e) => setExternalReferenceId(e.target.value)}
                  placeholder="Required for Delivered / Live"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Delivery Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DistributionStatus)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  {DISTRIBUTION_STATUSES.map((st) => (
                    <option key={st} value={st} className="bg-[#06152E]">
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Delivery Confirmation Date</label>
                <input
                  type="date"
                  value={deliveryConfirmedDate}
                  onChange={(e) => setDeliveryConfirmedDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[#C8D0DB] mb-1.5">Verified Live DSP Store URL</label>
                <input
                  type="url"
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[#C8D0DB] mb-1.5">
                  Delivery Evidence &amp; Verification Notes
                </label>
                <textarea
                  rows={3}
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  placeholder="Log partner delivery confirmation report reference, DDEX batch ID, or takedown notes..."
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 font-bold rounded-xl disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Delivery Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
