import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';
import { useToast } from '../contexts/ToastContext';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import { formatRelativeTimestamp } from '../utils/helpers';
import { Button, Card, EmptyState } from '../components/ui/Primitives';

export function NotificationsPage() {
  const { notifications, unreadNotificationsCount } = useAppData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(notifications);
    } catch (err: unknown) {
      showToast('Could not mark notifications read', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteNotification(id);
    } catch (err: unknown) {
      showToast('Could not delete notification', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {unreadNotificationsCount > 0
            ? `${unreadNotificationsCount} unread notification(s)`
            : 'All caught up'}
        </p>
        {unreadNotificationsCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            loading={markingAll}
            onClick={handleMarkAll}
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You will receive real-time alerts for expenses, settlements, reminders, group invites, and friend requests."
        />
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 sm:px-5 py-3.5 sm:py-4 flex items-start justify-between gap-3 sm:gap-4 transition-colors ${
                !n.isRead ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
              }`}
            >
              <button
                type="button"
                onClick={async () => {
                  if (!n.isRead) {
                    try {
                      await markNotificationRead(n.id);
                    } catch {
                      // Non-fatal if navigation still proceeds
                    }
                  }
                  if (n.link) navigate(n.link);
                }}
                className="text-left flex-1 min-w-0 cursor-pointer"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm break-words ${
                      n.isRead
                        ? 'font-medium text-slate-800 dark:text-slate-200'
                        : 'font-semibold text-slate-900 dark:text-white'
                    }`}
                  >
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      New
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed break-words">
                  {n.body}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {formatRelativeTimestamp(n.createdAt?.toDate?.())}
                </p>
              </button>

              <button
                type="button"
                aria-label="Delete notification"
                disabled={deletingId === n.id}
                onClick={() => handleDelete(n.id)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
