import React, { useEffect, useState } from 'react';
import { Save, LogOut, Plus, X, Tag, Coins, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import { CURRENCY_CODES, CurrencyCode, SUPPORTED_CURRENCIES, ThemePreference } from '../types';
import { normalizeExpenseTag } from '../utils/finance';
import { compressImageFile } from '../utils/helpers';
import { Avatar, Button, Card, InputField } from '../components/ui/Primitives';
import { PWAInstallCard } from '../components/PWAInstallCard';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function ProfilePage() {
  const { profile, updateMyProfile, logout } = useAuth();
  const { refreshProfiles } = useAppData();
  const { theme, setTheme } = useTheme();
  const { baseCurrency, setBaseCurrency } = useCurrency();
  const { showToast } = useToast();
  const { isStandalone } = usePWAInstall();

  const [fullName, setFullName] = useState('');
  const [handle, setHandle] = useState('');
  const [phone, setPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [newTagInput, setNewTagInput] = useState('');
  const [savingTag, setSavingTag] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName || '');
    setHandle(profile.handle || '');
    setPhone(profile.phone || '');
    setUpiId(profile.upiId || '');
    setPhotoUrl(profile.photoUrl || '');
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 400, 120000);
      setPhotoUrl(compressed);
      showToast('Profile picture ready — click Save Profile to apply', { variant: 'info' });
    } catch (err: unknown) {
      showToast('Avatar upload failed', {
        description: err instanceof Error ? err.message : 'Choose a smaller image.',
        variant: 'error',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await updateMyProfile({ fullName, handle, phone, upiId, photoUrl });
      await refreshProfiles([profile.uid], true);
      showToast('Profile saved', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not update profile', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const tag = normalizeExpenseTag(newTagInput);
    if (!tag) return;
    const existing = profile.customTags || [];
    if (existing.includes(tag)) {
      setNewTagInput('');
      return;
    }
    if (existing.length >= 40) {
      showToast('Maximum 40 custom tags reached', { variant: 'info' });
      return;
    }
    setSavingTag(true);
    try {
      await updateMyProfile({ customTags: [...existing, tag] });
      setNewTagInput('');
      showToast(`Added tag #${tag}`, { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not save tag', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSavingTag(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!profile) return;
    const next = (profile.customTags || []).filter((t) => t !== tagToRemove);
    try {
      await updateMyProfile({ customTags: next });
      showToast(`Removed #${tagToRemove}`, { variant: 'info' });
    } catch (err: unknown) {
      showToast('Could not remove tag', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <Avatar name={profile.fullName} photoUrl={photoUrl || profile.photoUrl} size="lg" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {profile.fullName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {profile.email} · Joined{' '}
                {profile.createdAt?.toDate?.().toLocaleDateString('en-IN') || 'Recently'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Upload Photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
            {photoUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400"
                onClick={() => setPhotoUrl('')}
                aria-label="Remove profile picture"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
              required
            />
            <InputField
              label="Username handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              hint="Lowercase letters, numbers, underscores"
              maxLength={40}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              label="Phone number (optional)"
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
            />
            <InputField
              label="UPI ID (optional)"
              placeholder="name@okicici"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              hint="Shown as QR code when friends settle with you"
              maxLength={100}
            />
          </div>

          {!photoUrl.startsWith('data:image/') && (
            <InputField
              label="Or paste profile picture URL (optional)"
              type="url"
              placeholder="https://..."
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              maxLength={500}
            />
          )}

          <div className="pt-2 flex justify-end">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              <Save className="w-4 h-4" />
              Save Profile
            </Button>
          </div>
        </form>
      </Card>

      {/* Preferred Base Currency & Custom Tags */}
      <Card className="p-6 space-y-5">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Preferred base currency
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Totals, net balances, and analytics charts convert automatically into this currency.
          </p>
          <select
            value={baseCurrency}
            onChange={(e) => {
              const code = e.target.value as CurrencyCode;
              setBaseCurrency(code);
              showToast(`Display currency set to ${code}`, { variant: 'success' });
            }}
            className="w-full sm:w-72 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code} ({SUPPORTED_CURRENCIES[code].symbol}) — {SUPPORTED_CURRENCIES[code].name}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Custom expense tags
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Save reusable labels (e.g. vacation, work, essential) for quick selection when adding expenses.
            </p>
          </div>

          <form onSubmit={handleAddTag} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="New tag (e.g. tax-deductible)"
              maxLength={30}
              className="flex-1 min-w-0 h-10 sm:h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <Button
              type="submit"
              size="sm"
              loading={savingTag}
              disabled={!normalizeExpenseTag(newTagInput)}
              className="w-full sm:w-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Tag
            </Button>
          </form>

          {(profile.customTags || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(profile.customTags || []).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  title={`Remove #${tag}`}
                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                >
                  <span>#{tag}</span>
                  <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <PWAInstallCard />

      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose your preferred color mode.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full sm:w-fit">
          {(['light', 'dark', 'system'] as ThemePreference[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setTheme(opt);
                if (profile.theme !== opt) {
                  updateMyProfile({ theme: opt }).catch(() => {});
                }
              }}
              className={`px-3 sm:px-4 min-h-[36px] py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                theme === opt
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="min-w-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
              Signed in as {profile.email}
            </span>
            {isStandalone && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block mt-0.5">
                Running as installed app
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="w-full sm:w-auto">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
