import React, { useState } from 'react';
import { PlusCircle, ShieldCheck, ShieldAlert, Edit3, X, Save, Info } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { saveCopyrightRecord } from '../services/firestoreService';
import type { CopyrightRecord } from '../types';

const EMPTY_FORM: Omit<CopyrightRecord, 'id' | 'createdAt' | 'updatedAt'> = {
  releaseId: '',
  releaseTitle: '',
  songOwnership: '',
  masterRecordingRights: '',
  publishingRights: '',
  lyricsOwnership: '',
  compositionOwnership: '',
  registrationNumber: '',
  isrc: '',
  upcEan: '',
  contentIdStatus: 'Not Enrolled',
  contentIdAssetId: '',
  licensingNotes: '',
  distributionAgreementRef: '',
  takedownStatus: 'None',
  takedownNotes: '',
  verifiedByAdmin: false,
  verifiedByUid: '',
};

export const CopyrightManagementView: React.FC = () => {
  const { currentUser, releases, copyrightRecords, pushToast } = usePlatform();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditingId(undefined);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (rec: CopyrightRecord) => {
    setEditingId(rec.id);
    setForm({
      releaseId: rec.releaseId || '',
      releaseTitle: rec.releaseTitle,
      songOwnership: rec.songOwnership || '',
      masterRecordingRights: rec.masterRecordingRights || '',
      publishingRights: rec.publishingRights || '',
      lyricsOwnership: rec.lyricsOwnership || '',
      compositionOwnership: rec.compositionOwnership || '',
      registrationNumber: rec.registrationNumber || '',
      isrc: rec.isrc || '',
      upcEan: rec.upcEan || '',
      contentIdStatus: rec.contentIdStatus,
      contentIdAssetId: rec.contentIdAssetId || '',
      licensingNotes: rec.licensingNotes || '',
      distributionAgreementRef: rec.distributionAgreementRef || '',
      takedownStatus: rec.takedownStatus,
      takedownNotes: rec.takedownNotes || '',
      verifiedByAdmin: rec.verifiedByAdmin,
      verifiedByUid: rec.verifiedByUid || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isSuperAdmin) return;
    if (!form.releaseTitle.trim()) {
      pushToast('Release title is required for a rights record.', 'error');
      return;
    }
    setSaving(true);
    try {
      const linked = releases.find(
        (r) => r.title.toLowerCase() === form.releaseTitle.trim().toLowerCase()
      );
      await saveCopyrightRecord({
        existingId: editingId,
        record: {
          ...form,
          releaseId: form.releaseId || linked?.id || '',
        },
        actor: currentUser,
      });
      pushToast(
        editingId ? 'Copyright & rights record updated.' : 'Copyright & rights record created.',
        'success'
      );
      setModalOpen(false);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save rights record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Music High Sky · Rights &amp; Identifier Registry
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Copyright &amp; Rights Management
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1">
            Maintain master recording rights, publishing splits, ISRC, UPC/EAN, Content ID assets, distribution agreements, and takedown records.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            Add Rights Record
          </button>
        )}
      </div>

      <div className="p-4 rounded-2xl luxury-card flex items-start gap-3 text-xs text-[#C8D0DB]">
        <Info className="w-4 h-4 text-[#00D5FF] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#F5D58A]">No Automatic Ownership Claims:</strong> Music High Sky never automatically claims copyright ownership. All master, publishing, lyrics, composition, ISRC, and UPC/EAN details must be manually entered and verified by the Super Administrator against signed agreements.
        </p>
      </div>

      {copyrightRecords.length === 0 ? (
        <div className="luxury-card rounded-2xl p-12 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-[#F5D58A]">
            No Copyright Records Logged Yet
          </p>
          <p className="text-xs text-[#C8D0DB] max-w-md mx-auto">
            Record verified ownership details, ISRC/UPC codes, Content ID enrollment, and distribution agreement references for Sunil Kumar&apos;s releases.
          </p>
          {isSuperAdmin && (
            <div className="pt-2">
              <button
                type="button"
                onClick={openNew}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                Create First Rights Record
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {copyrightRecords.map((rec) => (
            <article
              key={rec.id}
              className="luxury-card luxury-card-hover rounded-2xl p-5 sm:p-6 space-y-4 text-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold text-white truncate">
                    {rec.releaseTitle}
                  </h3>
                  <p className="font-mono text-[11px] text-[#00D5FF] mt-0.5">
                    ISRC: {rec.isrc || 'Unassigned'} · UPC/EAN: {rec.upcEan || 'Unassigned'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rec.verifiedByAdmin ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                      <ShieldCheck className="w-4 h-4" /> Admin Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#F5D58A] font-semibold">
                      <ShieldAlert className="w-4 h-4" /> Pending Verification
                    </span>
                  )}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => openEdit(rec)}
                      className="btn-electric p-1.5 rounded-lg cursor-pointer"
                      aria-label="Edit rights record"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-[#D4AF37]/20">
                <div>
                  <span className="text-[#8D9AAA] block">Song Ownership</span>
                  <span className="text-white">{rec.songOwnership || '—'}</span>
                </div>
                <div>
                  <span className="text-[#8D9AAA] block">Master Recording Rights</span>
                  <span className="text-white">{rec.masterRecordingRights || '—'}</span>
                </div>
                <div>
                  <span className="text-[#8D9AAA] block">Publishing Rights</span>
                  <span className="text-white">{rec.publishingRights || '—'}</span>
                </div>
                <div>
                  <span className="text-[#8D9AAA] block">Lyrics / Composition</span>
                  <span className="text-white">
                    {rec.lyricsOwnership || '—'} / {rec.compositionOwnership || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[#8D9AAA] block">Content ID</span>
                  <span className="text-[#00D5FF] font-semibold">
                    {rec.contentIdStatus}
                    {rec.contentIdAssetId ? ` (${rec.contentIdAssetId})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-[#8D9AAA] block">Takedown Status</span>
                  <span
                    className={
                      rec.takedownStatus === 'None' ? 'text-[#C8D0DB]' : 'text-rose-400 font-semibold'
                    }
                  >
                    {rec.takedownStatus}
                  </span>
                </div>
              </div>

              {(rec.registrationNumber || rec.distributionAgreementRef || rec.licensingNotes) && (
                <div className="p-3.5 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20 space-y-1 text-[11px] text-[#C8D0DB]">
                  {rec.registrationNumber && <p>Registration #: {rec.registrationNumber}</p>}
                  {rec.distributionAgreementRef && (
                    <p>Agreement Ref: {rec.distributionAgreementRef}</p>
                  )}
                  {rec.licensingNotes && <p>Licensing: {rec.licensingNotes}</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Admin Create / Edit Rights Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#020817]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmit}
            className="luxury-card border-[#D4AF37]/40 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3.5">
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">
                {editingId ? 'Edit Verified Rights Record' : 'New Copyright & Rights Record'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-[#C8D0DB] mb-1.5">Release / Song Title *</label>
                <input
                  type="text"
                  list="mhs-copyright-releases"
                  disabled={Boolean(editingId)}
                  value={form.releaseTitle}
                  onChange={(e) => setForm({ ...form, releaseTitle: e.target.value })}
                  placeholder="Select release or enter song title"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg disabled:opacity-60"
                />
                <datalist id="mhs-copyright-releases">
                  {releases.map((r) => (
                    <option key={r.id} value={r.title} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Song Ownership Information</label>
                <input
                  type="text"
                  value={form.songOwnership}
                  onChange={(e) => setForm({ ...form, songOwnership: e.target.value })}
                  placeholder="e.g. 100% Sunil Kumar"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Master Recording Rights</label>
                <input
                  type="text"
                  value={form.masterRecordingRights}
                  onChange={(e) => setForm({ ...form, masterRecordingRights: e.target.value })}
                  placeholder="Verified master owner"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Publishing Rights</label>
                <input
                  type="text"
                  value={form.publishingRights}
                  onChange={(e) => setForm({ ...form, publishingRights: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Lyrics Ownership</label>
                <input
                  type="text"
                  value={form.lyricsOwnership}
                  onChange={(e) => setForm({ ...form, lyricsOwnership: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Composition Ownership</label>
                <input
                  type="text"
                  value={form.compositionOwnership}
                  onChange={(e) => setForm({ ...form, compositionOwnership: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Copyright Registration Number</label>
                <input
                  type="text"
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">ISRC Code</label>
                <input
                  type="text"
                  value={form.isrc}
                  onChange={(e) => setForm({ ...form, isrc: e.target.value })}
                  placeholder="e.g. IN-MHS-26-00001"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">UPC / EAN Barcode</label>
                <input
                  type="text"
                  value={form.upcEan}
                  onChange={(e) => setForm({ ...form, upcEan: e.target.value })}
                  placeholder="12 or 13 digit barcode"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Content ID Status</label>
                <select
                  value={form.contentIdStatus}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contentIdStatus: e.target.value as CopyrightRecord['contentIdStatus'],
                    })
                  }
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="Not Enrolled" className="bg-[#06152E]">Not Enrolled</option>
                  <option value="Pending" className="bg-[#06152E]">Pending</option>
                  <option value="Active" className="bg-[#06152E]">Active</option>
                  <option value="Disputed" className="bg-[#06152E]">Disputed</option>
                </select>
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Content ID Asset ID</label>
                <input
                  type="text"
                  value={form.contentIdAssetId}
                  onChange={(e) => setForm({ ...form, contentIdAssetId: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Distribution Agreement Reference</label>
                <input
                  type="text"
                  value={form.distributionAgreementRef}
                  onChange={(e) => setForm({ ...form, distributionAgreementRef: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Takedown Request Status</label>
                <select
                  value={form.takedownStatus}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      takedownStatus: e.target.value as CopyrightRecord['takedownStatus'],
                    })
                  }
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="None" className="bg-[#06152E]">None</option>
                  <option value="Requested" className="bg-[#06152E]">Requested</option>
                  <option value="In Progress" className="bg-[#06152E]">In Progress</option>
                  <option value="Completed" className="bg-[#06152E]">Completed</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[#C8D0DB] mb-1.5">Licensing &amp; Takedown Notes</label>
                <textarea
                  rows={2}
                  value={form.licensingNotes}
                  onChange={(e) => setForm({ ...form, licensingNotes: e.target.value })}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-2.5 p-3.5 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/25 cursor-pointer w-full">
                  <input
                    type="checkbox"
                    checked={form.verifiedByAdmin}
                    onChange={(e) => setForm({ ...form, verifiedByAdmin: e.target.checked })}
                    className="accent-[#D4AF37]"
                  />
                  <span className="text-white font-medium">
                    Confirm Administrator Verification (ownership details reviewed against signed documentation)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Rights Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
