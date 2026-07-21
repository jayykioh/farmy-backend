const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

const uri = "mongodb+srv://adnparr_db_user:Dong1234@farmdiaries.ytxyxvl.mongodb.net/Farm_Diaries?appName=FarmDiaries";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const database = client.db("Farm_Diaries");
    const collection = database.collection("shopitems");

    const newItems = [
      {
        _id: randomUUID(),
        name: 'Mũ Bảo Hiểm',
        category: 'HAT',
        price: 600,
        required_level: 4,
        image_url: '/shop/mu-bao-hiem.svg',
        anchor: { width: '80%', top: '-20%' },
      },
      {
        _id: randomUUID(),
        name: 'Hoa Cài Đầu',
        category: 'HAT',
        price: 150,
        required_level: 1,
        image_url: '/shop/hoa-cai-dau.svg',
        anchor: { width: '40%', top: '-5%', left: '15%' },
      },
      {
        _id: randomUUID(),
        name: 'Kính Tròn',
        category: 'HAT',
        price: 350,
        required_level: 3,
        image_url: '/shop/kinh-tron.svg',
        anchor: { width: '60%', top: '40%' },
      }
    ];

    for (const item of newItems) {
      const exists = await collection.findOne({ name: item.name });
      if (!exists) {
        await collection.insertOne(item);
        console.log(`Inserted: ${item.name}`);
      } else {
        console.log(`Already exists: ${item.name}`);
      }
    }
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
