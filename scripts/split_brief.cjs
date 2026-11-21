const fs = require('fs');
const p = 'data/text-export/writing-brief.json';
const brief = JSON.parse(fs.readFileSync(p, 'utf8'));
for (const b of brief.batches) {
  const one = { meta: brief.meta, batches: [b] };
  const file = `data/text-export/brief-${b.id}.json`;
  fs.writeFileSync(file, JSON.stringify(one, null, 2), 'utf8');
  console.log(file, fs.statSync(file).size, 'bytes', b.items.length, 'items');
}
