import { Fragment, type ReactNode } from 'react';

export interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link';
  content: string;
  href?: string;
}

const INLINE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

/**
 * Only http(s)/mailto links become anchors. Note bodies are attacker-reachable
 * (a shared/imported tyche-notes.json is rendered here), and React sets an
 * href attribute verbatim, so `[x](javascript:…)` would be a clickable XSS
 * without this allowlist. Anything else renders as inert text.
 */
export function safeHref(href: string | undefined): string | null {
  const trimmed = (href ?? '').trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

/**
 * Tokenize a single line of markdown into inline spans (bold/italic/code/link).
 * Pure + unit-testable; deliberately minimal (no nesting).
 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) tokens.push({ type: 'text', content: text.slice(last, index) });
    if (m[2] !== undefined) tokens.push({ type: 'bold', content: m[2] });
    else if (m[4] !== undefined) tokens.push({ type: 'italic', content: m[4] });
    else if (m[6] !== undefined) tokens.push({ type: 'code', content: m[6] });
    else if (m[8] !== undefined) tokens.push({ type: 'link', content: m[8], href: m[9] });
    last = index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', content: text.slice(last) });
  return tokens;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.type === 'bold') return <strong key={i} className="font-semibold text-zinc-200">{t.content}</strong>;
        if (t.type === 'italic') return <em key={i} className="italic">{t.content}</em>;
        if (t.type === 'code') return <code key={i} className="rounded bg-zinc-800 px-1 text-[10px] text-sky-300">{t.content}</code>;
        if (t.type === 'link') {
          const href = safeHref(t.href);
          // Unsafe scheme (javascript:, data:, …) → render the label as plain
          // text rather than a clickable script vector.
          if (!href) return <Fragment key={i}>{t.content}</Fragment>;
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">
              {t.content}
            </a>
          );
        }
        return <Fragment key={i}>{t.content}</Fragment>;
      })}
    </>
  );
}

/** Render a small subset of markdown (headings, bullets, code fences, inline). */
export function renderMarkdown(md: string): ReactNode {
  const lines = md.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) buf.push(lines[i++]!);
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded bg-zinc-900 p-2 text-[10px] text-zinc-300">
          {buf.join('\n')}
        </pre>,
      );
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s/, '');
      blocks.push(
        <p key={key++} className={`font-semibold text-zinc-200 ${level === 1 ? 'text-sm' : 'text-xs'}`}>
          <Inline text={text} />
        </p>,
      );
      i++;
    } else if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i]!)) items.push(lines[i++]!.replace(/^[-*]\s/, ''));
      blocks.push(
        <ul key={key++} className="list-disc pl-4 text-[11px] text-zinc-400">
          {items.map((it, j) => (
            <li key={j}>
              <Inline text={it} />
            </li>
          ))}
        </ul>,
      );
    } else if (line.trim() === '') {
      i++;
    } else {
      blocks.push(
        <p key={key++} className="text-[11px] text-zinc-400">
          <Inline text={line} />
        </p>,
      );
      i++;
    }
  }
  return <div className="space-y-1">{blocks}</div>;
}
