import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeDirection } from '../src/hooks/swipeDirection.js';
test('horizontal decisions reject small movements and vertical scrolling', () => {
  const origin={x:100,y:100};
  assert.equal(swipeDirection(origin,{x:200,y:110}),'right');
  assert.equal(swipeDirection(origin,{x:0,y:110}),'left');
  assert.equal(swipeDirection(origin,{x:125,y:100}),null);
  assert.equal(swipeDirection(origin,{x:200,y:250}),null);
});
