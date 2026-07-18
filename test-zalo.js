require('dotenv').config();

async function test() {
  const oaToken = process.env.ZALO_OA_ACCESS_TOKEN;
  const phone = '84848047964';

  // Try official OA API v2 (older stable endpoint)
  console.log('\n--- Test OA Info with v2 OA API ---');
  const oaResp = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', {
    headers: { access_token: oaToken }
  });
  const oaData = await oaResp.json();
  console.log('OA v2 Info:', JSON.stringify(oaData, null, 2));

  // Try ZNS with OA token directly (some docs say OA token works for ZNS)
  console.log('\n--- Testing ZNS template list with OA token ---');
  const listResp = await fetch('https://business.openapi.zalo.me/template/all?offset=0&limit=100', {
    headers: { access_token: oaToken }
  });
  const listData = await listResp.json();
  console.log('ZNS template list:', JSON.stringify(listData, null, 2));

  // Try ZNS sandbox send (no template needed in sandbox)
  console.log('\n--- Testing ZNS sandbox send (no template) ---');
  const sandboxResp = await fetch('https://business.openapi.zalo.me/message/template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: oaToken,
    },
    body: JSON.stringify({
      phone: phone,
      template_id: '268901', // Zalo default sandbox OTP template
      template_data: {
        otp: '123456'
      },
      tracking_id: `track_${Date.now()}`
    }),
  });
  const sandboxData = await sandboxResp.json();
  console.log('ZNS Sandbox Response:', JSON.stringify(sandboxData, null, 2));
}

test().catch(console.error);
