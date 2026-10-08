import { readFileSync, readdirSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
const assets = {};
function walk(dir) {
  for (const item of readdirSync(dir, {withFileTypes:true})) {
    const path = join(dir,item.name);
    if (item.isDirectory()) walk(path);
    else assets['/'+relative('static',path).replaceAll('\\','/')] = readFileSync(path,'utf8');
  }
}
walk('static');
const originalData = JSON.parse(readFileSync('worker/original-data.json','utf8'));
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist/server',{recursive:true});
mkdirSync('dist/.openai',{recursive:true});
const providers=readFileSync('static/js/translation-providers.js','utf8').replace('export async function','async function');
writeFileSync('dist/server/index.js',`const ASSETS=${JSON.stringify(assets)};\nconst ORIGINAL=${JSON.stringify(originalData)};\n`+providers+'\n'+readFileSync('worker/index.js','utf8'));
cpSync(existsSync('.openai/hosting.json')?'.openai/hosting.json':'.openai/hosting.example.json','dist/.openai/hosting.json');
cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built existing WordClick interface, private Worker and D1 migrations.');
