import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PostInstallContext } from '../../../../../src/engine/types.js';

export default async function postInstall(ctx: PostInstallContext): Promise<void> {
  await fs.writeFile(
    path.join(ctx.outputDir, 'POSTINSTALL_ALPHA.txt'),
    `alpha ran for ${ctx.projectName}`,
    'utf8',
  );
}
