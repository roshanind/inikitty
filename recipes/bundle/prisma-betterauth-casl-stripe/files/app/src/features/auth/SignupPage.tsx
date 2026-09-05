import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { signUp } from '../../lib/auth-client';

export function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Email verification is required (see api/src/auth/auth.ts) and the v1 email delivery is a
  // console.log stub (docs/product-scope.md §13), so there's no real inbox to send the user to —
  // this just tells them where the link actually goes for now.
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signUpError } = await signUp.email({ name, email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message ?? 'Sign up failed.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 360 }}>
        <h1>Check your email</h1>
        <p>
          We sent a verification link to <strong>{email}</strong>. In local dev, the API's own
          console logs it (email delivery is a stub — see <code>auth.ts</code>) — open the link
          there, then <Link to="/login">sign in</Link>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 360 }}>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
