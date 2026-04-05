import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PasskeyGate from '@/components/ui/PasskeyGate';

// Mock supabase client
const mockGetSession = vi.fn();
const mockSignInAnonymously = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      signInAnonymously: mockSignInAnonymously,
    },
  }),
}));

describe('PasskeyGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn();
  });

  // ── Initial render states ─────────────────────────────────────────

  it('shows a loading spinner (no app content) while session is pending', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('renders children immediately when an existing session is found', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } } });
    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => {
      expect(screen.getByText('App Content')).toBeInTheDocument();
    });
  });

  it('shows the passkey gate form when no session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => {
      expect(screen.getByText('Enter your secure passkey to access study sessions.')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument();
    });
  });

  it('renders the "Welcome to Adoris" heading on the gate form', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<PasskeyGate><div>App</div></PasskeyGate>);
    await waitFor(() => {
      expect(screen.getByText('Welcome to Adoris')).toBeInTheDocument();
    });
  });

  // ── Incorrect passkey ─────────────────────────────────────────────

  it('shows "Incorrect." error on wrong passkey and clears the input', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: false }),
    });

    render(<PasskeyGate><div>App Content</div></PasskeyGate>);

    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Incorrect.')).toBeInTheDocument();
    });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('clears the error message when the user starts re-typing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: false }),
    });

    render(<PasskeyGate><div>App</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText('Incorrect.')).toBeInTheDocument());

    // Start re-typing — error should clear
    fireEvent.change(input, { target: { value: 'b' } });
    expect(screen.queryByText('Incorrect.')).not.toBeInTheDocument();
  });

  // ── Correct passkey ───────────────────────────────────────────────

  it('renders children after a correct passkey and anonymous sign-in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInAnonymously.mockResolvedValue({ error: null });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: true }),
    });

    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'correct-key' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('App Content')).toBeInTheDocument();
    });
  });

  it('calls /api/auth/verify-passkey with the entered passkey', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInAnonymously.mockResolvedValue({ error: null });
    const mockFn = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    (global.fetch as ReturnType<typeof vi.fn>) = mockFn;

    render(<PasskeyGate><div>App</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Passkey'), { target: { value: 'my-secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Passkey').closest('form')!);

    await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalled());

    const [url, opts] = mockFn.mock.calls[0];
    expect(url).toBe('/api/auth/verify-passkey');
    expect(JSON.parse(opts.body)).toEqual({ passkey: 'my-secret' });
  });

  // ── Auth errors ───────────────────────────────────────────────────

  it('shows "Auth error. Try again." when signInAnonymously fails', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInAnonymously.mockResolvedValue({ error: new Error('auth_error') });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: true }),
    });

    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'correct-key' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Auth error. Try again.')).toBeInTheDocument();
    });
    // The gate form stays visible (not unlocked) — the gate overlay is still shown
    expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument();
    // signInAnonymously was attempted
    expect(mockSignInAnonymously).toHaveBeenCalled();
  });

  it('shows "Connection error." when fetch throws a network error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network unreachable'));

    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'any-key' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Connection error.')).toBeInTheDocument();
    });
  });

  // ── Form guard ────────────────────────────────────────────────────

  it('does not submit when the input is empty', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const mockFn = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>) = mockFn;

    render(<PasskeyGate><div>App</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    // Submit with empty input
    fireEvent.submit(screen.getByPlaceholderText('Passkey').closest('form')!);
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('shows "Verifying..." on the button while checking', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    // Use a pending promise so the checking state persists
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<PasskeyGate><div>App</div></PasskeyGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'test-key' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Verifying...')).toBeInTheDocument();
    });
  });
});
