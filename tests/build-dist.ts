// Runs once before the tests. The package loading tests read dist/, which is not rebuilt
// by a test run on its own, so without this they check whatever build was made last.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const root = fileURLToPath(new URL('../', import.meta.url));
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}
