import { type FormEvent, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
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
      <Container maxWidth="xs" sx={{ py: 8 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Check your email
        </Typography>
        <Typography>
          We sent a verification link to <strong>{email}</strong>. In local dev, the API's own
          console logs it (email delivery is a stub — see <code>auth.ts</code>) — open the link
          there, then{' '}
          <Link component={RouterLink} to="/login">
            sign in
          </Link>
          .
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Sign up
      </Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          slotProps={{ htmlInput: { minLength: 8 } }}
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </Button>
      </Box>
      <Typography sx={{ mt: 2 }}>
        Already have an account?{' '}
        <Link component={RouterLink} to="/login">
          Sign in
        </Link>
      </Typography>
    </Container>
  );
}
