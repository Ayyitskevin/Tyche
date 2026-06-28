import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import { useWorkspaceStore } from '../state/workspaceStore';
import { PanelHost } from './PanelHost';

const Grid = WidthProvider(GridLayout);

function EmptyWorkspace() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      <div className="text-sm text-zinc-400">Empty workspace</div>
      <p className="max-w-md text-xs text-zinc-600">
        Type a command in the bar above. Try{' '}
        <span className="font-mono text-zinc-400">AAPL DES</span>,{' '}
        <span className="font-mono text-zinc-400">QM</span>, or{' '}
        <span className="font-mono text-zinc-400">HELP</span>.
      </p>
    </div>
  );
}

export function WorkspaceGrid() {
  const panels = useWorkspaceStore((s) => s.panels);
  const cols = useWorkspaceStore((s) => s.cols);
  const rowHeight = useWorkspaceStore((s) => s.rowHeight);
  const applyLayout = useWorkspaceStore((s) => s.applyLayout);

  if (panels.length === 0) {
    return (
      <div className="absolute inset-0 p-3">
        <EmptyWorkspace />
      </div>
    );
  }

  const maximized = panels.find((p) => p.maximized);
  if (maximized) {
    return (
      <div className="absolute inset-0 p-2">
        <PanelHost panel={maximized} />
      </div>
    );
  }

  const layout: Layout[] = panels.map((p) => ({
    i: p.id,
    x: p.grid.x,
    y: p.grid.y,
    w: p.grid.w,
    h: p.grid.h,
    minW: 2,
    minH: 3,
  }));

  return (
    <div className="absolute inset-0 overflow-auto">
      <Grid
        className="layout"
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        margin={[8, 8]}
        containerPadding={[8, 8]}
        draggableHandle=".panel-drag-handle"
        draggableCancel=".no-drag"
        compactType="vertical"
        onLayoutChange={(next) =>
          applyLayout(next.map((i) => ({ i: i.i, x: i.x, y: i.y, w: i.w, h: i.h })))
        }
      >
        {panels.map((panel) => (
          <div key={panel.id}>
            <PanelHost panel={panel} />
          </div>
        ))}
      </Grid>
    </div>
  );
}
