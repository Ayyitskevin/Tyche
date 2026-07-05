// The changelog is the repo's CHANGELOG.md, inlined into the bundle at build
// time (?raw). No network or runtime file access, so it works offline, in the
// read-only demo, and in the Docker image alike.
import changelogRaw from '../../../../CHANGELOG.md?raw';
import { renderMarkdown } from './markdown';

/**
 * CHANGELOG — renders the project's release history as markdown. A public
 * trust/retention signal (see docs/LAUNCH.md Week 4); the single source is the
 * root CHANGELOG.md, so the panel never drifts from the file.
 */
export function ChangelogModule() {
  return <div className="h-full overflow-auto px-3 py-2 leading-relaxed">{renderMarkdown(changelogRaw)}</div>;
}
