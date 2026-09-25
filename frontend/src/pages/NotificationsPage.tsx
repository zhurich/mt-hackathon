import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Notification } from '../api/types'
import { Async } from '../components/ui'
import { NOTIFICATION_ICON, formatDateTime } from '../labels'

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>('/notifications'),
  })
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read', { ids: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Уведомления</h1>
        {(query.data?.unread ?? 0) > 0 && (
          <button className="btn" onClick={() => markAll.mutate()} disabled={markAll.isPending}>Прочитать все</button>
        )}
      </div>
      <Async query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="muted">Уведомлений пока нет.</p>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {data.items.map((item) => {
                const body = (
                  <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <span style={{ fontSize: '1.4rem' }} aria-hidden>{NOTIFICATION_ICON[item.kind] ?? '🔔'}</span>
                    <div style={{ flex: 1 }}>
                      <div className="spread">
                        <strong>{item.title}</strong>
                        {!item.read_at && <span className="chip tone-critical">новое</span>}
                      </div>
                      <div className="small secondary">{item.body}</div>
                      <div className="small muted">{formatDateTime(item.created_at)}</div>
                    </div>
                  </div>
                )
                return item.link ? (
                  <Link key={item.id} to={item.link} className="card card-link">{body}</Link>
                ) : (
                  <div key={item.id} className="card">{body}</div>
                )
              })}
            </div>
          )
        }
      </Async>
    </div>
  )
}
