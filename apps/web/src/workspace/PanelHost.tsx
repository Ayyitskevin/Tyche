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

  const [provenance, setProvenance] = useState<DataProvenance | null>(null);
  const reportProvenance = useCallback((p: DataProvenance | null) => setProvenance(p), []);
  const setState = useCallback(
    (patch: Record<string, unknown>) => setPanelState(panel.id, patch),
    [panel.id, setPanelState],
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
          missingCapabilities={missing}
          active={active}
          reportProvenance={reportProvenance}
        />
      </div>
    </PanelFrame>
  );
}
