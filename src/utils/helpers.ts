export const GROUP_COVER_PRESETS = [
  {
    id: 'coastal',
    label: 'Coastal Trip',
    url: '/src/assets/images/group_cover_coastal_1795773888598.jpg',
  },
  {
    id: 'nightlife',
    label: 'Dining & Lounge',
    url: '/src/assets/images/group_cover_nightlife_1795773888791.jpg',
  },
  {
    id: 'cafe',
    label: 'Weekend Outing',
    url: '/src/assets/images/auth_editorial_banner_1795773889050.jpg',
  },
];

export const AUTH_EDITORIAL_IMAGE = '/src/assets/images/auth_editorial_banner_1795773889050.jpg';
export const PUBLIC_HERO_IMAGE = '/src/assets/images/hero_friends_ledger_1795894225431.jpg';
export const ABOUT_PLANNING_IMAGE = '/src/assets/images/about_shared_planning_1795894225584.jpg';

export async function sha256Hex(input: string): Promise<string> {
  const normalized = input.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sanitizeHandleInput(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
}

export function normalizeHandle(raw: string): string {
  const cleaned = sanitizeHandleInput(raw);
  return cleaned.length >= 2 ? cleaned : `user_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateToken(prefix = ''): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return prefix ? `${prefix}_${base64Url}` : base64Url;
}

export function getPublicAppOrigin(): string {
  const configured =
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_APP_URL
      ? (import.meta as { env?: Record<string, string | undefined> }).env!.VITE_APP_URL!.trim().replace(/\/+$/, '')
      : '';

  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (isLocal && configured && /^https:\/\//i.test(configured)) {
      return configured;
    }
    return window.location.origin.replace(/\/+$/, '');
  }

  return configured || '';
}

export function buildGroupInviteUrl(token: string): string {
  const origin = getPublicAppOrigin();
  return `${origin}/join/group/${encodeURIComponent(token)}`;
}

export function buildTripInviteUrl(token: string): string {
  const origin = getPublicAppOrigin();
  return `${origin}/join/trip/${encodeURIComponent(token)}`;
}

export function buildFriendInviteUrl(token: string): string {
  const origin = getPublicAppOrigin();
  return `${origin}/join/friend/${encodeURIComponent(token)}`;
}

export function buildGroupWhatsAppInviteMessage(groupName: string, inviteUrl: string): string {
  return [
    'Hey! Join our group on TallyCircle (Friends Expense Tracker).',
    '',
    `Group: ${groupName}`,
    '',
    'Click this link to join:',
    inviteUrl,
  ].join('\n');
}

export function buildTripWhatsAppInviteMessage(
  tripName: string,
  destination: string,
  inviteUrl: string
): string {
  return [
    'Hey! Join our trip on TallyCircle (Friends Expense Tracker).',
    '',
    `Trip: ${tripName}${destination ? ` (${destination})` : ''}`,
    '',
    'Click this link to join:',
    inviteUrl,
  ].join('\n');
}

export async function shareInviteLink(params: {
  title: string;
  text: string;
  url: string;
}): Promise<'shared' | 'copied'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: params.title,
        text: params.text,
        url: params.url,
      });
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw err;
      }
      // Fall back to clipboard copy if share sheet fails
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(params.url);
    return 'copied';
  }
  throw new Error('Sharing and clipboard access are unavailable in this browser.');
}

export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function deterministicFriendshipId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export function buildUpiUri(params: {
  upiId: string;
  payeeName: string;
  amountInr: number;
  note?: string;
}): string {
  const query = new URLSearchParams({
    pa: params.upiId.trim(),
    pn: params.payeeName.trim().slice(0, 50),
    am: params.amountInr.toFixed(2),
    cu: 'INR',
    tn: (params.note || 'TallyCircle settlement').slice(0, 60),
  });
  return `upi://pay?${query.toString()}`;
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function formatShortDate(isoOrDate: string): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(isoOrDate: string): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTimestamp(date: Date | undefined): string {
  if (!date) return 'Just now';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function compressImageFile(
  file: File,
  maxWidth = 960,
  maxBytes = 260000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxBytes && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        if (dataUrl.length > maxBytes) {
          reject(new Error('Image is still too large after compression. Please use a smaller file.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function isValidSafeUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('/') || url.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
