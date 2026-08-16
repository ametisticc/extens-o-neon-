#!/usr/bin/env node
// ============================================================
// Gera uma chave de extensão e seu HASH (sha256).
//
// A chave completa é impressa UMA vez e deve ser guardada pelo
// operador (será usada no header X-NeonWarm-Key da extensão).
// No banco, grave apenas o HASH na tabela neon_warm_extension_keys.
//
// Uso:  npm run key:create -- "nome-da-chave" "extension-id"
// ============================================================
import { generateApiKey, sha256 } from '../src/lib/crypto.js';

const name = process.argv[2] || 'Minha extensão';
const extensionId = process.argv[3] || 'neon-warm-extension';

const apiKey = generateApiKey();
const keyHash = sha256(apiKey);

console.log('==============================================');
console.log('  CHAVE GERADA — guarde agora, não será repetida');
console.log('==============================================');
console.log('');
console.log(`Nome:         ${name}`);
console.log(`Extension ID: ${extensionId}`);
console.log('');
console.log(`API KEY (use no header X-NeonWarm-Key):`);
console.log(apiKey);
console.log('');
console.log(`HASH (grave na tabela neon_warm_extension_keys):`);
console.log(keyHash);
console.log('');
console.log('SQL sugerido:');
console.log(`insert into public.neon_warm_extension_keys (name, key_hash, extension_id, status)
values ('${name}', '${keyHash}', '${extensionId}', 'active');`);
