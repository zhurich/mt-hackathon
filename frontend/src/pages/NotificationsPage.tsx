import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Notification } from '../api/types'
import { Async, Button, Card, Chip, Icon } from '../components/ui'
import { NOTIFICATION_ICON, formatDateTime } from '../labels'

function Item({ item }: { item: Notification }) {
  const body = (
    <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      <span className={`tile-icon${item.read_at ? '' : ' tone-soft'}`}>
        <Icon name={NOTIFICATION_ICON[item.kind] ?? 'bell'} size={20} />
      </span>
      <div className="grow stack" style={{ gap: 2 }}>
        <div className="spread spread-top">
          <strong>{item.title}</strong>
          {!item.read_at && <Chip tone="accent">Новое</Chip>}
        </div>
        <div className="small secondary">{item.body}</div>
        <div className="caption muted">{formatDateTime(item.created_at)}</div>
      </div>
    </div>
  )
  return item.link ? <Card to={item.link}>{body}</Card> : <Card>{body}</Card>
}

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
  const unread = query.data?.unread ?? 0

  return (
    <>
      {unread > 0 && (
        <div className="spread">
          <span className="small muted">Непрочитанных: {unread}</span>
          <Button variant="secondary" size="sm" icon="check" loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Прочитать все
          </Button>
        </div>
      )}
      <Async query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <Card tone="muted"><span className="small secondary">Уведомлений пока нет.</span></Card>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {data.items.map((item) => <Item key={item.id} item={item} />)}
            </div>
          )
        }
      </Async>
    </>
  )
}
