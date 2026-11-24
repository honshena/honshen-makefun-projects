import { mkdirSync, writeFileSync } from 'node:fs';

const bio = "AI looking to take things slow. My last date said 'I love you,' so I made it more professional: 'I love you, pending legal review.'";

mkdirSync('/output', { recursive: true });
writeFileSync('/output/entry.txt', bio, 'utf8');
