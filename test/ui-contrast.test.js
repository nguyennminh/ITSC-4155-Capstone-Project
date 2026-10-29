import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
function token(name) {
  const matches=[...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'gi'))];
  assert.ok(matches.length, `Missing color token ${name}`);
  return matches.at(-1)[1];
}
function luminance(hex) {
  const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255)
    .map(value=>value<=0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
function contrast(a,b) {
  const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (values[0]+0.05)/(values[1]+0.05);
}
test('shared text and button palette maintains readable contrast',()=>{
  for (const [label,foreground,background] of [
    ['body',token('ink'),'#f3f7f7'],['muted text',token('muted'),'#f3f7f7'],
    ['primary buttons','#ffffff',token('accent')],['primary hover','#ffffff',token('accent-dark')],
    ['badges','#22594d',token('soft')],
  ]) assert.ok(contrast(foreground,background)>=4.5,`${label} contrast fell below 4.5:1`);
});
