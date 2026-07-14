require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI;
  console.log('Connecting to:', uri);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db();
    const users = database.collection('users');

    const result = await users.updateOne(
      { email: 'hadong@test.com' },
      { $set: { phone_number: '0848047964' } }
    );

    console.log('Update result:', result);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
