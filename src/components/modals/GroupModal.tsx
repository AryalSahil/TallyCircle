import React, { useEffect, useState } from 'react';
import { Upload, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useToast } from '../../contexts/ToastContext';
import type { Group } from '../../types';
import { createGroup, updateGroupDetails } from '../../services/groupService';
import { compressImageFile, GROUP_COVER_PRESETS } from '../../utils/helpers';
import { Avatar, Button, InputField, Modal } from '../ui/Primitives';

export function GroupModal({
  open,
  onClose,
  editingGroup,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editingGroup?: Group | null;
  onCreated?: (groupId: string) => void;
}) {
  const { profile } = useAuth();
  const { acceptedFriendUids, profilesMap } = useAppData();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [coverImage, setCoverImage] = useState(GROUP_COVER_PRESETS[0].url);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingGroup) {
      setName(editingGroup.name);
      setDescription(editingGroup.description || '');
      setStartDate(editingGroup.startDate || '');
      setEndDate(editingGroup.endDate || '');
      setCoverImage(editingGroup.coverImage || GROUP_COVER_PRESETS[0].url);
      setSelectedFriends([]);
    } else {
      setName('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setCoverImage(GROUP_COVER_PRESETS[0].url);
      setSelectedFriends([]);
    }
  }, [open, editingGroup]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 960, 220000);
      setCoverImage(compressed);
    } catch (err: unknown) {
      showToast('Image upload failed', {
        description: err instanceof Error ? err.message : 'Choose a smaller image.',
        variant: 'error',
      });
    }
  };

  const toggleFriend = (uid: string) => {
    setSelectedFriends((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!name.trim()) {
      showToast('Group name is required', { variant: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingGroup) {
        await updateGroupDetails(profile, editingGroup, {
          name,
          description,
          coverImage,
          startDate,
          endDate,
        });
        showToast('Group updated', { variant: 'success' });
        onClose();
      } else {
        const initialMembers = selectedFriends
          .map((uid) => profilesMap[uid])
          .filter(Boolean);
        const newId = await createGroup(profile, {
          name,
          description,
          coverImage,
          startDate,
          endDate,
          initialMembers,
        });
        showToast('Group created', { variant: 'success' });
        onClose();
        onCreated?.(newId);
      }
    } catch (err: unknown) {
      showToast('Could not save group', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingGroup ? 'Edit Group' : 'Create Expense Group'}
      subtitle="All group members share equal permissions to manage expenses and settlements."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Group name"
          placeholder="e.g., Goa Trip 2026, Weekend Clubbing"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Description (optional)
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Flights, villa stay, dining and shared cabs..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Trip start date (optional)"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <InputField
            label="Trip end date (optional)"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Cover banner
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 cursor-pointer hover:underline">
              <Upload className="w-3.5 h-3.5" />
              Upload custom
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {GROUP_COVER_PRESETS.map((preset) => {
              const active = coverImage === preset.url;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setCoverImage(preset.url)}
                  className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all cursor-pointer ${
                    active
                      ? 'border-emerald-600 dark:border-emerald-400'
                      : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {active && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {!editingGroup && acceptedFriendUids.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Add friends now (optional)
            </label>
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {acceptedFriendUids.map((uid) => {
                const friend = profilesMap[uid];
                const checked = selectedFriends.includes(uid);
                return (
                  <label
                    key={uid}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={friend?.displayName || 'Friend'}
                        photoUrl={friend?.photoUrl}
                        size="xs"
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
                        {friend?.displayName || uid}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFriend(uid)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {editingGroup ? 'Save Changes' : 'Create Group'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
