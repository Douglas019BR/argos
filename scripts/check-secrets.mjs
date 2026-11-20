import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const patterns = [
  { name: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'OpenAI key', regex: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Slack token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
];

const textFile = /\.(?:ts|js|mjs|cjs|json|md|ya?ml|xml|env|example|sh|txt)$/i;
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean);

let hits = 0;

for (const file of files) {
  if (!textFile.test(file) && !file.endsWith('Dockerfile')) {
    continue;
  }

  let lines;
  try {
    lines = readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    continue;
  }

  lines.forEach((line, index) => {
    for (const { name, regex } of patterns) {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        console.error(`${file}:${index + 1}: ${name}`);
        hits += 1;
      }
    }
  });
}

if (hits > 0) {
  console.error(`Found ${hits} potential secret(s)`);
  process.exit(1);
}

console.log(`No secrets found in ${files.length} files`);
