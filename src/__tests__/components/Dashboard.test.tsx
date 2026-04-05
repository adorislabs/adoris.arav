import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// File-level navigation mock so we can capture router.push calls
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u' } } } }) },
  }),
}));

// Mock fetch globally (setup.tsx also sets global.fetch = vi.fn(); this override is fine)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBooksResponse(books: unknown[]) {
  return Promise.resolve({ json: async () => ({ success: true, books }) });
}

function makeSessionsResponse(sessions: Record<string, unknown>) {
  return Promise.resolve({ json: async () => ({ success: true, sessions }) });
}

const TWO_CHAPTER_BOOK = [{
  title: 'NCERT Class 5',
  subject: 'Maths',
  chapters: [
    { id: 'ch1', chapter_title: 'Fractions', chapter_number: 1 },
    { id: 'ch2', chapter_title: 'Decimals', chapter_number: 2 },
  ],
}];

const TWO_BOOK_DATA = [
  {
    title: 'Physics Book',
    subject: 'Physics',
    chapters: [{ id: 'phy1', chapter_title: 'Mechanics', chapter_number: 1 }],
  },
  {
    title: 'Chemistry Book',
    subject: 'Chemistry',
    chapters: [{ id: 'chem1', chapter_title: 'Atomic Structure', chapter_number: 1 }],
  },
];

function setupFetch(
  books: unknown[],
  sessions: Record<string, unknown> = {},
) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/books')) return makeBooksResponse(books);
    if (String(url).includes('/api/pdfs/sessions-batch')) return makeSessionsResponse(sessions);
    return Promise.resolve({ json: async () => ({}) });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
  });

  it('renders loading skeletons while data is being fetched', async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the empty state when no books are returned', async () => {
    setupFetch([]);

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No PDFs found/i)).toBeInTheDocument();
    });
  });

  it('uses the sessions-batch API rather than individual session lookups', async () => {
    setupFetch(TWO_CHAPTER_BOOK, {
      ch1: { currentPage: 2, totalPages: 10, masteredCount: 3, quizCompleted: false, lastUpdated: '2024-01-01' },
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('NCERT Class 5')).toBeInTheDocument());

    const urls = mockFetch.mock.calls.map(([u]: [string]) => u);
    expect(urls.some((u: string) => u.includes('/api/pdfs/sessions-batch'))).toBe(true);
    expect(urls.every((u: string) => !u.includes('/api/pdfs/session?chapterId='))).toBe(true);
  });

  it('renders chapters grouped under their book title', async () => {
    setupFetch(TWO_CHAPTER_BOOK);

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('NCERT Class 5')).toBeInTheDocument();
      expect(screen.getByText('Fractions')).toBeInTheDocument();
      expect(screen.getByText('Decimals')).toBeInTheDocument();
    });
  });

  it('renders multiple book groups each with their own header', async () => {
    setupFetch(TWO_BOOK_DATA);

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Physics Book')).toBeInTheDocument();
      expect(screen.getByText('Chemistry Book')).toBeInTheDocument();
      expect(screen.getByText('Mechanics')).toBeInTheDocument();
      expect(screen.getByText('Atomic Structure')).toBeInTheDocument();
    });
  });

  it('shows subject badge next to each book title', async () => {
    setupFetch(TWO_BOOK_DATA);

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Physics')).toBeInTheDocument();
      expect(screen.getByText('Chemistry')).toBeInTheDocument();
    });
  });

  it('displays correct stats (Chapters, In Progress, Completed)', async () => {
    setupFetch(TWO_CHAPTER_BOOK, {
      ch1: { currentPage: 3, totalPages: 10, masteredCount: 3, quizCompleted: false, lastUpdated: '2024-01-01' },
      ch2: { currentPage: 10, totalPages: 10, masteredCount: 10, quizCompleted: true, lastUpdated: '2024-01-02' },
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Fractions')).toBeInTheDocument());

    // Stats labels
    expect(screen.getByText('Chapters')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();

    // Stats values — find by the card's combined text content
    const chaptersCard = screen.getByText('Chapters').parentElement;
    expect(chaptersCard?.textContent).toContain('2');

    const inProgressCard = screen.getByText('In Progress').parentElement;
    expect(inProgressCard?.textContent).toContain('1');

    const completedCard = screen.getByText('Completed').parentElement;
    expect(completedCard?.textContent).toContain('1');
  });

  it('shows Active badge for an in-progress chapter', async () => {
    setupFetch(TWO_CHAPTER_BOOK, {
      ch1: { currentPage: 3, totalPages: 10, masteredCount: 3, quizCompleted: false, lastUpdated: '2024-01-01' },
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Fractions')).toBeInTheDocument());
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Done badge for a completed chapter', async () => {
    setupFetch(TWO_CHAPTER_BOOK, {
      ch2: { currentPage: 10, totalPages: 10, masteredCount: 10, quizCompleted: true, lastUpdated: '2024-01-01' },
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Decimals')).toBeInTheDocument());
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows chapter-complete message for a completed chapter', async () => {
    setupFetch([{
      title: 'Book',
      subject: 'Math',
      chapters: [{ id: 'c1', chapter_title: 'Sets', chapter_number: 1 }],
    }], {
      c1: { currentPage: 5, totalPages: 5, masteredCount: 5, quizCompleted: true, lastUpdated: '2024-01-01' },
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Chapter complete/i)).toBeInTheDocument();
    });
  });

  it('shows "Not started yet" for a chapter with no session data', async () => {
    setupFetch(TWO_CHAPTER_BOOK, {}); // no sessions

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Fractions')).toBeInTheDocument());
    // Both chapters have no session
    const notStarted = screen.getAllByText(/Not started yet/i);
    expect(notStarted.length).toBeGreaterThanOrEqual(1);
  });

  it('navigates to the session page when a chapter card is clicked', async () => {
    setupFetch(TWO_CHAPTER_BOOK, {
      ch1: { currentPage: 1, totalPages: 5, masteredCount: 1, quizCompleted: false, lastUpdated: '2024-01-01' },
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Fractions')).toBeInTheDocument());

    // Click the chapter title — event bubbles to the card's onClick
    fireEvent.click(screen.getByText('Fractions'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/session/ch1');
  });
});
