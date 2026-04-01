const fetch = require('node-fetch');

async function testAPI() {
  console.log('Testing Grand Archive API...\n');
  
  // Test page 1
  const response1 = await fetch('https://api.gatcg.com/cards/search?page=1&limit=10');
  const data1 = await response1.json();
  
  console.log('Page 1 Response:');
  console.log('Keys:', Object.keys(data1));
  console.log('Full response:', JSON.stringify(data1, null, 2));
  
  // Test page 2
  console.log('\n\nTesting page 2...');
  const response2 = await fetch('https://api.gatcg.com/cards/search?page=2&limit=10');
  const data2 = await response2.json();
  
  console.log('Page 2 Response:');
  console.log('Keys:', Object.keys(data2));
  console.log('Data length:', data2.data?.length);
}

testAPI().catch(console.error);