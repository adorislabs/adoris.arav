import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u' } } } }) },
  }),
}));

// Mock fetch for dashboard
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons initially', async () => {
    // Never resolve so loading persists
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    // Should show skeleton loaders
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders empty state when no books', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, books: [], sessions: {} }),
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No PDFs found/i)).toBeInTheDocument();
    });
  });

  it('uses batch session API', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/books')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            books: [{
              title: 'NCERT Class 5',
              subject: 'Maths',
              chapters: [{ id: 'ch1', chapter_title: 'Ch 1', chapter_number: 1 }],
            }],
          }),
        });
      }
      if (url.includes('/api/pdfs/sessions-batch')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            sessions: { ch1: { currentPage: 2, totalPages: 10, masteredCount: 3, quizCompleted: false, lastUpdated: '2024-01-01' } },
          }),
        });
      }
      return Promise.resolve({ json: async () => ({}) });
    });

    const { default: DashboardPage } = await import('@/app/dashboard/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('NCERT Class 5')).toBeInTheDocument();
    });

    // Verify it called batch API, not individual session APIs
    const calls = mockFetch.mock.calls.map(([url]: any) => url);
    expect(calls.some((u: string) => u.includes('/api/pdfs/sessions-batch'))).toBe(true);
    expect(calls.some((u: string) => u.includes('/api/pdfs/session?chapterId='))).toBe(false);
  });
});
