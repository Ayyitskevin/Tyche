import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleAuditSink, FileAuditSink, auditEvent } from './audit';

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-audit-'));
  dirs.push(dir);
  return join(dir, 'audit.log');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('ConsoleAuditSink', () => {
  it('buffers recent events newest-first without writing to console when disabled', () => {
    const sink = new ConsoleAuditSink(false);
    sink.record(auditEvent('local', 'a.one', 'allow'));
    sink.record(auditEvent('local', 'a.two', 'deny', { resource: 'r1' }));
    const recent = sink.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.action).toBe('a.two'); // newest first
    expect(recent[0]?.outcome).toBe('deny');
  });

  it('caps recent() to the requested limit', () => {
    const sink = new ConsoleAuditSink(false);
    for (let i = 0; i < 5; i++) sink.record(auditEvent('local', `a.${i}`, 'allow'));
    expect(sink.recent(2)).toHaveLength(2);
  });
});

describe('FileAuditSink', () => {
  it('appends each event as a JSON line and exposes recent()', async () => {
    const path = tempFile();
    const sink = new FileAuditSink(path);
    sink.record(auditEvent('local', 'workspace.save', 'allow', { resource: 'ws_1' }));
    sink.record(auditEvent('local', 'note.save', 'allow', { resource: 'n_1' }));
    await sink.flush();

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).action).toBe('workspace.save');
    expect(sink.recent(10)[0]?.action).toBe('note.save'); // newest first
  });

  it('seeds recent() from an existing log on init (durable across restarts)', async () => {
    const path = tempFile();
    const first = new FileAuditSink(path);
    first.record(auditEvent('local', 'alert.save', 'allow'));
    await first.flush();

    const second = new FileAuditSink(path);
    await second.init();
    expect(second.recent(10).map((e) => e.action)).toContain('alert.save');
  });

  it('never throws and keeps buffering when the file write fails (queue is not poisoned)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tyche-audit-'));
    dirs.push(dir);
    // A file where a directory is expected → mkdir(dirname) rejects (ENOTDIR/EEXIST).
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    const sink = new FileAuditSink(join(blocker, 'audit.log'));

    expect(() => sink.record(auditEvent('local', 'a.one', 'allow'))).not.toThrow();
    await expect(sink.flush()).resolves.toBeUndefined();
    expect(sink.recent(10)[0]?.action).toBe('a.one'); // still buffered in memory

    // A subsequent write still runs (the failed write did not poison the queue).
    expect(() => sink.record(auditEvent('local', 'a.two', 'allow'))).not.toThrow();
    await sink.flush();
    expect(sink.recent(10)[0]?.action).toBe('a.two');
  });

  it('init on a missing file starts clean without throwing', async () => {
    const sink = new FileAuditSink(join(tmpdir(), 'tyche-audit-missing', 'nope.log'));
    await expect(sink.init()).resolves.toBeUndefined();
    expect(sink.recent(10)).toEqual([]);
  });
});
