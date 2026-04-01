'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Chapter {
  id: string; chapter_number: number; chapter_title: string;
  page_count: number; is_processed: boolean; storage_path: string;
}
interface Book {
  id: string; title: string; subject: string; author: string;
  chapters: Chapter[]; created_at: string;
}

const inputStyle = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: '10px',
  padding: '10px 14px',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
};

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBook, setShowNewBook] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [newBook, setNewBook] = useState({ title: '', subject: '', author: '' });
  const [uploadForm, setUploadForm] = useState({ chapterNumber: '', chapterTitle: '' });
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/books');
      const data = await res.json();
      if (data.success) setBooks(data.books || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchBooks(); }, []);

  const handleCreateBook = async () => {
    if (!newBook.title || !newBook.subject) return;
    const res = await fetch('/api/books', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBook),
    });
    const data = await res.json();
    if (data.success) { setShowNewBook(false); setNewBook({ title: '', subject: '', author: '' }); fetchBooks(); }
  };

  const handleUploadChapter = async (bookId: string) => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !uploadForm.chapterNumber || !uploadForm.chapterTitle) {
      setUploadProgress('Fill all fields and select a PDF.'); return;
    }
    setUploadProgress('Uploading...');
    const fd = new FormData();
    fd.append('file', file); fd.append('bookId', bookId);
    fd.append('chapterNumber', uploadForm.chapterNumber);
    fd.append('chapterTitle', uploadForm.chapterTitle);
    try {
      const res = await fetch('/api/books/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setUploadProgress('Uploaded ✓');
        setUploadForm({ chapterNumber: '', chapterTitle: '' });
        if (fileInputRef.current) fileInputRef.current.value = '';
        setUploadingFor(null); fetchBooks();
      } else { setUploadProgress(`Error: ${data.error}`); }
    } catch { setUploadProgress('Upload failed.'); }
    setTimeout(() => setUploadProgress(null), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Library</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Upload chapter PDFs and start tutoring sessions.</p>
          </div>
          <button
            onClick={() => setShowNewBook(true)}
            className="text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
            style={{ background: 'var(--accent)', color: '#0c0c0e' }}
          >
            + New Book
          </button>
        </div>

        {/* New Book Modal */}
        {showNewBook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(12,12,14,0.85)', backdropFilter: 'blur(20px)' }}>
            <div className="w-full max-w-sm mx-6 rounded-2xl p-7 animate-slideUp" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>New Book</h2>
              <div className="space-y-3">
                <input value={newBook.title} onChange={e => setNewBook({ ...newBook, title: e.target.value })}
                  placeholder="Title (e.g. HC Verma Vol 1)" style={inputStyle} />
                <input value={newBook.subject} onChange={e => setNewBook({ ...newBook, subject: e.target.value })}
                  placeholder="Subject (e.g. Physics)" style={inputStyle} />
                <input value={newBook.author} onChange={e => setNewBook({ ...newBook, author: e.target.value })}
                  placeholder="Author (optional)" style={inputStyle} />
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={handleCreateBook}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--accent)', color: '#0c0c0e' }}>
                  Create
                </button>
                <button onClick={() => setShowNewBook(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Books */}
        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
        ) : books.length === 0 ? (
          <div className="rounded-xl p-14 text-center border border-dashed" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>No books yet</p>
            <button onClick={() => setShowNewBook(true)}
              className="text-sm px-4 py-2 rounded-lg font-semibold"
              style={{ background: 'var(--accent)', color: '#0c0c0e' }}>
              + Create your first book
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {books.map(book => (
              <div key={book.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                {/* Book header */}
                <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{book.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                        {book.subject}
                      </span>
                      {book.author && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>by {book.author}</span>}
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{book.chapters.length} chapter{book.chapters.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadingFor(uploadingFor === book.id ? null : book.id)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    + Upload
                  </button>
                </div>

                {/* Upload form */}
                {uploadingFor === book.id && (
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                    <p className="text-[10px] uppercase tracking-widest mb-3 font-semibold" style={{ color: 'var(--text-muted)' }}>Add Chapter</p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input type="number" value={uploadForm.chapterNumber}
                          onChange={e => setUploadForm({ ...uploadForm, chapterNumber: e.target.value })}
                          placeholder="Ch #" min="1"
                          style={{ ...inputStyle, width: '72px', flexShrink: 0 }} />
                        <input type="text" value={uploadForm.chapterTitle}
                          onChange={e => setUploadForm({ ...uploadForm, chapterTitle: e.target.value })}
                          placeholder="Chapter Title"
                          style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <input type="file" ref={fileInputRef} accept=".pdf"
                        className="text-xs w-full block"
                        style={{ color: 'var(--text-secondary)' }} />
                      <button onClick={() => handleUploadChapter(book.id)}
                        className="text-xs w-full px-4 py-2.5 rounded-lg font-semibold"
                        style={{ background: 'var(--accent)', color: '#0c0c0e' }}>
                        Upload PDF
                      </button>
                    </div>
                    {uploadProgress && (
                      <p className="text-xs mt-2" style={{ color: uploadProgress.startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>
                        {uploadProgress}
                      </p>
                    )}
                  </div>
                )}

                {/* Chapters */}
                {book.chapters.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    No chapters yet — click Upload to add PDFs
                  </div>
                ) : (
                  <div>
                    {book.chapters.map((ch, idx) => (
                      <div key={ch.id}
                        className="px-5 py-3 flex items-center justify-between transition-colors"
                        style={{
                          borderTop: idx > 0 ? `1px solid var(--border-soft)` : undefined,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center shrink-0"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            {ch.chapter_number}
                          </span>
                          <div>
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ch.chapter_title}</span>
                            {ch.page_count > 0 && (
                              <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{ch.page_count}p</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {ch.is_processed && (
                            <span className="text-[9px] font-bold tracking-wider" style={{ color: 'var(--success)' }}>PLANNED</span>
                          )}
                          <Link href={`/dashboard/session/${ch.id}`}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)' }}>
                            Study →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
