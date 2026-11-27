import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import { formatRelativeTimestamp } from '../utils/helpers';
import { Button, Card, EmptyState } from '../components/ui/Primitives';

export function NotificationsPage() {
  const { notifications, unreadNotificationsCount } = useAppData();
  const navigate = useNavigate();

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
            onClick={() => markAllNotificationsRead(notifications)}
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
                  if (!n.isRead) await markNotificationRead(n.id);
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
                onClick={() => deleteNotification(n.id)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg cursor-pointer shrink-0"
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
