const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

async function main() {
  const uri = 'mongodb+srv://adnparr_db_user:Dong1234@farmdiaries.ytxyxvl.mongodb.net/Farm_Diaries?appName=FarmDiaries';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('Farm_Diaries');
    const collection = db.collection('shop_items');

    const items = [
      {
        name: 'Nón Lá Truyền Thống',
        category: 'HAT',
        price: 300,
        required_level: 1,
        image_url: '/shop/non-la.svg',
        anchor: { width: '90%', top: '-15%' }
      },
      {
        name: 'Mũ Rơm Đi Biển',
        category: 'HAT',
        price: 450,
        required_level: 2,
        image_url: '/shop/mu-rom.svg',
        anchor: { width: '80%', top: '-15%' }
      },
      {
        name: 'Kính Râm Ngầu',
        category: 'HAT',
        price: 200,
        required_level: 1,
        image_url: '/shop/kinh-ram.svg',
        anchor: { width: '60%', top: '40%' }
      },
      {
        name: 'Mũ Ảo Thuật',
        category: 'HAT',
        price: 800,
        required_level: 5,
        image_url: '/shop/mu-ao-thuat.svg',
        anchor: { width: '65%', top: '-25%' }
      },
      {
        name: 'Khăn Quàng Đỏ',
        category: 'OUTFIT',
        price: 350,
        required_level: 3,
        image_url: '/shop/khan-quang.svg',
        anchor: { width: '70%', top: '70%' }
      },
      {
        name: 'Vương Miện',
        category: 'HAT',
        price: 1500,
        required_level: 10,
        image_url: '/shop/vuong-mien.svg',
        anchor: { width: '50%', top: '-10%' }
      },
      {
        name: 'Kính Cận',
        category: 'HAT', // Frontend treats as glasses
        price: 250,
        required_level: 2,
        image_url: '/shop/kinh-can.svg',
        anchor: { width: '60%', top: '40%' }
      },
      {
        name: 'Cánh Thiên Thần',
        category: 'BACKGROUND',
        price: 2000,
        required_level: 15,
        image_url: '/shop/canh-thien-than.svg',
        anchor: { width: '140%', top: '10%', left: '50%', transform: 'translateX(-50%)', zIndex: 0 }
      }
    ];

    for (const item of items) {
      const existing = await collection.findOne({ name: item.name });
      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { 
            image_url: item.image_url, 
            anchor: item.anchor,
            category: item.category,
            price: item.price,
            required_level: item.required_level
          }}
        );
      } else {
        await collection.insertOne({
          _id: randomUUID(),
          ...item,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    }

    console.log('Successfully upserted 8 shop items!');
  } finally {
    await client.close();
  }
}

main().catch(console.error);
