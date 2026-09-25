import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { ErrorBox } from '../components/ui'

const DEMO_ACCOUNTS = [
  { login: 'demo', role: 'Проводник (демо)' },
  { login: 'trainer', role: 'Тренер' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ login: '', password: '' })
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(form.login.trim(), form.password)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen" style={{ padding: '1rem' }}>
      <form className="card stack" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <div>
          <h1>🚄 ВСМ Тренажёр</h1>
          <p className="secondary">Тренировка действий в нештатных ситуациях для проводников высокоскоростной магистрали.</p>
        </div>
        <div>
          <label htmlFor="login">Логин</label>
          <input id="login" autoComplete="username" value={form.login}
                 onChange={(e) => setForm({ ...form, login: e.target.value })} required />
        </div>
        <div>
          <label htmlFor="password">Пароль</label>
          <input id="password" type="password" autoComplete="current-password" value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        {error !== null && <ErrorBox error={error} />}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        <div className="small muted">
          Демо-доступ (данные синтетические), пароль <code>vsm2026</code>:
          <div className="row" style={{ marginTop: 6 }}>
            {DEMO_ACCOUNTS.map((account) => (
              <button type="button" key={account.login} className="chip" style={{ border: 0, cursor: 'pointer' }}
                      onClick={() => setForm({ login: account.login, password: 'vsm2026' })}>
                {account.role}: {account.login}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
