/** Qualification mounts the real widget; all commands go to the real HTTP backend. */
import { createRoot } from 'react-dom/client';
import { TerminalWorkbench } from '../../src/components/terminal/TerminalWorkbench';

const root = document.getElementById('qualification-root');
if (!root) throw new Error('QUALIFICATION_MOUNT_MISSING');
createRoot(root).render(<TerminalWorkbench />);
