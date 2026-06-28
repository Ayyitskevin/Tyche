import { createDefaultRegistry } from '@tyche/terminal-kernel';

/** Singleton command registry built from the kernel's default command surface. */
export const commandRegistry = createDefaultRegistry();
