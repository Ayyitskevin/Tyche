import { useMemo, useState } from 'react';
import type { AlertField, AlertOperator, AlertRule } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { formatRelativeTime } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useAlertStream, type AlertEvent } from '../providers/useAlertStream';
import { useTerminalStore } from '../state/terminalStore';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';

const FIELDS: Array<{ id: AlertField; label: string }> = [
  { id: 'price', label: 'Price' },
  { id: 'changePercent', label: '% Chg' },
  { id: 'volume', label: 'Volume' },
];

const OPERATORS: Array<{ id: AlertOperator; label: string }> = [
  { id: 'gt', label: '>' },
  { id: 'gte', label: '≥' },
  { id: 'lt', label: '<' },
  { id: 'lte', label: '≤' },
  { id: 'crosses_above', label: 'crosses ↑' },
  { id: 'crosses_below', label: 'crosses ↓' },
];

function opLabel(op: AlertOperator): string {
  return OPERATORS.find((o) => o.id === op)?.label ?? op;
}
function fieldLabel(field: AlertField): string {
  return FIELDS.find((f) => f.id === field)?.label ?? field;
}
function describeRule(rule: AlertRule): string {
  return `${fieldLabel(rule.field)} ${opLabel(rule.operator)} ${rule.threshold}`;
}

export function AlertsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const alerts = useApiData(() => api.getAlerts(), []);
  useReportProvenance(reportProvenance, alerts.provenance);
  const pushMessage = useTerminalStore((s) => s.pushMessage);

  const [draftSymbol, setDraftSymbol] = useState(symbol ?? '');
  const [field, setField] = useState<AlertField>('price');
  const [operator, setOperator] = useState<AlertOperator>('gt');
  const [threshold, setThreshold] = useState('');
  const [oneShot, setOneShot] = useState(false);
  const [fires, setFires] = useState<AlertEvent[]>([]);

  const streamSymbols = useMemo(
    () => [...new Set((alerts.data ?? []).filter((r) => r.active).map((r) => r.symbol))],
    [alerts.data],
  );

  useAlertStream(streamSymbols, (event) => {
    pushMessage('warn', `${event.rule.symbol} alert — ${describeRule(event.rule)}`);
    setFires((prev) => [event, ...prev].slice(0, 10));
    alerts.reload();
  });

  async function addRule() {
    const sym = draftSymbol.trim().toUpperCase();
    const value = Number(threshold);
    if (!sym || !Number.isFinite(value)) return;
    await api.saveAlert({ symbol: sym, field, operator, threshold: value, oneShot, active: true });
    setThreshold('');
    alerts.reload();
  }

  async function toggleRule(rule: AlertRule) {
    await api.saveAlert({ ...rule, active: !rule.active });
    alerts.reload();
  }

  async function removeRule(id: string) {
    await api.deleteAlert(id);
    alerts.reload();
  }

  const controlClass =
    'rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        <input
          aria-label="Alert symbol"
          value={draftSymbol}
          onChange={(e) => setDraftSymbol(e.target.value)}
          placeholder="symbol"
          spellCheck={false}
          className={`w-16 font-mono ${controlClass}`}
        />
        <select aria-label="Alert field" value={field} onChange={(e) => setField(e.target.value as AlertField)} className={controlClass}>
          {FIELDS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Alert operator"
          value={operator}
          onChange={(e) => setOperator(e.target.value as AlertOperator)}
          className={controlClass}
        >
          {OPERATORS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Alert threshold"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addRule();
          }}
          placeholder="value"
          inputMode="decimal"
          className={`w-16 font-mono ${controlClass}`}
        />
        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          <input type="checkbox" checked={oneShot} onChange={(e) => setOneShot(e.target.checked)} className="accent-sky-500" />
          once
        </label>
        <button
          type="button"
          onClick={() => void addRule()}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          add
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={alerts} missingCapabilities={missingCapabilities} emptyMessage="No alert rules yet.">
          {(rules) =>
            rules.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">No alert rules yet. Add one above.</div>
            ) : (
              <ul className="divide-y divide-zinc-900 font-mono text-[11px]">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex items-center gap-2 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => executeInput(`${rule.symbol} DES`)}
                      className="w-14 shrink-0 text-left text-sky-300 hover:underline"
                    >
                      {rule.symbol}
                    </button>
                    <span className="flex-1 text-zinc-300">{describeRule(rule)}</span>
                    {rule.lastTriggeredAt && (
                      <span className="shrink-0 text-[10px] text-amber-400/80">
                        fired {formatRelativeTime(rule.lastTriggeredAt)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={rule.active ? `Pause ${rule.symbol} alert` : `Resume ${rule.symbol} alert`}
                      onClick={() => void toggleRule(rule)}
                      className={`shrink-0 rounded px-1 ${rule.active ? 'text-emerald-400' : 'text-zinc-600'} hover:bg-zinc-800`}
                    >
                      {rule.active ? '●' : '○'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${rule.symbol} alert`}
                      onClick={() => void removeRule(rule.id)}
                      className="shrink-0 text-zinc-600 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
        </ModuleBody>
        {fires.length > 0 && (
          <div className="border-t border-zinc-800 px-2 py-1.5">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Recent fires</div>
            <ul className="space-y-0.5 font-mono text-[11px] text-zinc-400">
              {fires.map((f, i) => (
                <li key={`${f.rule.id}-${f.firedAt}-${i}`}>
                  <span className="text-amber-400/80">{f.rule.symbol}</span> {describeRule(f.rule)} ·{' '}
                  {formatRelativeTime(f.firedAt)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
