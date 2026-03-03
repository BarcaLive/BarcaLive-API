import { fetchCached } from './src/cache-helper.js';
import { CONFIG } from './src/config.js';

async function runTest() {
  const now = new Date();
  const rawTime = now.toISOString().replace('T', ' ').substring(0, 19);
  const timestamp30 = new Date(Math.floor(now.getTime() / 30000) * 30000).toISOString().replace('T', ' ').substring(0, 19);
  const timestamp300 = new Date(Math.floor(now.getTime() / 300000) * 300000).toISOString().replace('T', ' ').substring(0, 19);

  console.log(`Raw time: ${rawTime}`);
  console.log(`Rounded 30s: ${timestamp30}`);
  console.log(`Rounded 300s: ${timestamp300}`);

  const url30 = `${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[after]=${timestamp30}&limit=5&order[startTime]=asc`;
  const url300 = `${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[before]=${timestamp300}&limit=15&order[startTime]=desc`;

  console.log('\nFetching url30:', url30);
  const res30 = await fetch(url30);
  const data30 = await res30.json();
  console.log(`Result 30s items: ${data30.data ? data30.data.length : 'Error'}`);

  console.log('\nFetching url300:', url300);
  const res300 = await fetch(url300);
  const data300 = await res300.json();
  console.log(`Result 300s items: ${data300.data ? data300.data.length : 'Error'}`);
}

runTest().catch(console.error);
