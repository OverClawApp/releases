import { useEffect, useRef } from 'react';
import type { TerminalLine } from '../hooks/useOpenClaw';

export default function Terminal({ lines }: { lines: TerminalLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div
      className="rounded-lg p-4 font-mono text-xs leading-relaxed overflow-auto max-h-64"
      style={{ background: '#0D1117', border: '1px solid var(--border-color)' }}
    >
      {lines.length === 0 ? (
        <>
          <div style={{ color: 'var(--text-muted)' }}>• Waiting to start…</div>
          <div style={{ color: 'var(--text-muted)' }}>• Press a command to begin.</div>
        </>
      ) : (
        lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: line.type === 'error' ? '#f85149' : line.type === 'complete' ? '#3fb950' : '#c9d1d9',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {line.data}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
