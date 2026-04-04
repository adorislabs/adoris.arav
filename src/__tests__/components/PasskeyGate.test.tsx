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
    (global.fetch as any) = vi.fn();
  });

  it('shows loading spinner initially', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    // Should not show the app content yet
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('shows app content when session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } } });
    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => {
      expect(screen.getByText('App Content')).toBeInTheDocument();
    });
  });

  it('shows passkey form when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<PasskeyGate><div>App Content</div></PasskeyGate>);
    await waitFor(() => {
      expect(screen.getByText('Enter your secure passkey to access study sessions.')).toBeInTheDocument();
    });
  });

  it('shows error on incorrect passkey', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ success: false }),
    });

    render(<PasskeyGate><div>App Content</div></PasskeyGate>);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'wrong-key' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Incorrect.')).toBeInTheDocument();
    });
  });

  it('authenticates on correct passkey', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInAnonymously.mockResolvedValue({ error: null });
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ success: true }),
    });

    render(<PasskeyGate><div>App Content</div></PasskeyGate>);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Passkey')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Passkey');
    fireEvent.change(input, { target: { value: 'correct-key' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('App Content')).toBeInTheDocument();
    });
  });
});
