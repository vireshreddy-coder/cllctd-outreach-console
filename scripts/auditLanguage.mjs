import { spawnSync } from 'node:child_process';

const longDash = String.fromCharCode(0x2014);
const terms = [
  process.env.CLLCTD_RESTRICTED_TERMS || '',
  'DP' + 'DP',
  'SHA' + '-256',
  'consent ' + 'hash',
  '7' + '0%',
  '3' + '0%',
  'fund' + 'raise',
  'fund' + 'raising',
  'value' + 'ation',
  'buyers' + '@',
  'investors' + '@',
  'hello' + '@',
  ('ven' + 'dors@'),
  ('ven' + 'dor'),
  'within ' + '24h',
  'same ' + 'day',
  'instant' + 'ly',
  longDash,
]
  .join('|')
  .split('|')
  .map((term) => term.trim())
  .filter(Boolean);

const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const result = spawnSync(
  'rg',
  ['-n', escaped, '.', '--glob', '!node_modules/**', '--glob', '!package-lock.json', '--glob', '!dist/**', '--glob', '!work/**'],
  { stdio: 'inherit' },
);

if (result.status === 0) {
  process.exit(1);
}

if (result.status === 1) {
  console.log('Language audit passed');
  process.exit(0);
}

process.exit(result.status ?? 1);
