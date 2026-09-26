import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth'
import { Button, FilterChip, TextField } from '../components/ui'

const DEMO_ACCOUNTS = [
  { login: 'demo', role: 'Проводник' },
  { login: 'trainer', role: 'Наставник' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ login: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(form.login.trim(), form.password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сервер недоступен. Проверьте подключение.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login-form" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark" aria-hidden />
          <span>ВСМ · Обучение</span>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <h1>Вход в систему</h1>
          <p className="secondary pretty">
            Обучение и тренировка действий в нештатных ситуациях для проводников высокоскоростной магистрали Москва — Санкт-Петербург.
          </p>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <TextField id="login" label="Логин" autoComplete="username" value={form.login}
                     onChange={(value) => setForm({ ...form, login: value })} />
          <TextField id="password" label="Пароль" type="password" autoComplete="current-password" value={form.password}
                     onChange={(value) => setForm({ ...form, password: value })} error={error} />
        </div>
        <Button type="submit" size="lg" block loading={busy} disabled={!form.login.trim() || !form.password}>
          {busy ? 'Входим' : 'Войти'}
        </Button>
        <div className="stack" style={{ gap: 10 }}>
          <div className="small muted">Демо-доступ, пароль <code>vsm2026</code></div>
          <div className="row">
            {DEMO_ACCOUNTS.map((account) => (
              <FilterChip key={account.login} selected={form.login === account.login}
                          onClick={() => setForm({ login: account.login, password: 'vsm2026' })}>
                {account.role}: {account.login}
              </FilterChip>
            ))}
          </div>
        </div>
        <div className="login-footer">Демо-среда. Все данные синтетические (152-ФЗ).</div>
      </form>
    </div>
  )
}
