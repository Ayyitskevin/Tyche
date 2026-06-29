import { useCallback, useState } from 'react';
import type { DataProvenance, Panel } from '@tyche/contracts';
import { moduleMissingCapabilities } from '@tyche/module-sdk';
import { PanelFrame } from '@tyche/ui';
import { moduleRegistry } from '../modules/registry';
import { BetaPlaceholder } from '../modules/BetaPlaceholder';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';

export function PanelHost({ panel }: { panel: Panel }) {
  const def = moduleRegistry.get(panel.moduleId);
  const Component = def?.component ?? BetaPlaceholder;

  const capabilities = useTerminalStore((s) => s.capabilities);
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);
  const closePanel = useWorkspaceStore((s) => s.closePanel);
  const toggleMinimize = useWorkspaceStore((s) => s.toggleMinimize);
  const toggleMaximize = useWorkspaceStore((s) => s.toggleMaximize);
  const setActivePanel = useWorkspaceStore((s) => s.setActivePanel);
  const setPanelState = useWorkspaceStore((s) => s.setPanelState);
  const setLinkedSymbol = useWorkspaceStore((s) => s.setLinkedSymbol);
  const cyclePanelLink = useWorkspaceStore((s) => s.cyclePanelLink);
  const setActiveInstrument = useTerminalStore((s) => s.setActiveInstrument);

  const [provenance, setProvenance] = useState<DataProvenance | null>(null);
  const reportProvenance = useCallback((p: DataProvenance | null) => setProvenance(p), []);
  const setState = useCallback(
    (patch: Record<string, unknown>) => setPanelState(panel.id, patch),
    [panel.id, setPanelState],
  );
  const setSymbol = useCallback(
    (symbol: string) => {
      setLinkedSymbol(panel.id, symbol);
      // Move the global pointer so the StatusBar reflects the operative ticker.
      // assetClass defaults to equity for a bare retarget; a command re-resolves it.
      setActiveInstrument({ symbol, assetClass: 'equity' });
    },
    [panel.id, setLinkedSymbol, setActiveInstrument],
  );

  const missing = moduleMissingCapabilities(def?.requiredCapabilities ?? [], capabilities);
  const args = (panel.state.args as string[] | undefined) ?? [];
  const active = activePanelId === panel.id;

  return (
    <PanelFrame
      title={panel.title}
      symbol={panel.symbol}
      maturity={def?.maturity ?? 'stable'}
      provenance={provenance}
      linkColor={panel.linkGroup}
      active={active}
      minimized={panel.minimized}
      maximized={panel.maximized}
      actions={
        <button
          type="button"
          aria-label="Cycle link group"
          title="Link group (sync ticker across linked panels)"
          onClick={() => cyclePanelLink(panel.id)}
          className="no-drag flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
        >
          {panel.linkGroup ? '●' : '○'}
        </button>
      }
      onClose={() => closePanel(panel.id)}
      onMinimize={() => toggleMinimize(panel.id)}
      onMaximize={() => toggleMaximize(panel.id)}
    >
      <div className="h-full" onMouseDown={() => setActivePanel(panel.id)}>
        <Component
          panelId={panel.id}
          moduleId={panel.moduleId}
          symbol={panel.symbol}
          args={args}
          commandId={panel.commandId ?? ''}
          assetClass={null}
          state={panel.state}
          setState={setState}
          setSymbol={setSymbol}
          missingCapabilities={missing}
          active={active}
          reportProvenance={reportProvenance}
        />
      </div>
    </PanelFrame>
  );
}
