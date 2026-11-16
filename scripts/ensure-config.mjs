import fs from 'node:fs';
import path from 'node:path';

const configDir = path.resolve(process.cwd(), 'config');
for (const file of ['personal.json', 'schedule.json']) {
  const target = path.join(configDir, file);
  const example = path.join(configDir, `${file}.example`);
  if (!fs.existsSync(target) && fs.existsSync(example)) {
    fs.copyFileSync(example, target);
    console.log(`[DispoLive] Initialized config/${file} from config/${file}.example`);
  }
}
