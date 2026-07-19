require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/farm-diary';

const newItems = [
  {
    name: 'Vòng Hào Quang',
    category: 'HAT',
    price: 3000,
    required_level: 20,
    image_url: '/shop/halo.svg',
    anchor: { width: '40%', top: '-20%', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }
  },
  {
    name: 'Dây Chuyền Vàng',
    category: 'OUTFIT',
    price: 1200,
    required_level: 8,
    image_url: '/shop/gold-chain.svg',
    anchor: { width: '50%', top: '65%', left: '50%', transform: 'translateX(-50%)', zIndex: 4 }
  },
  {
    name: 'Đám Mây Mưa',
    category: 'EFFECT',
    price: 800,
    required_level: 6,
    image_url: '/shop/rain-cloud.svg',
    anchor: { width: '90%', top: '-30%', left: '50%', transform: 'translateX(-50%)', zIndex: 6 }
  },
  {
    name: 'Áo Choàng Siêu Nhân',
    category: 'BACKGROUND',
    price: 2500,
    required_level: 18,
    image_url: '/shop/superman-cape.svg',
    anchor: { width: '120%', top: '35%', left: '50%', transform: 'translateX(-50%)', zIndex: 0 }
  }
];

async function addItems() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const shopCollection = db.collection('shopitems');

    for (const item of newItems) {
      const existing = await shopCollection.findOne({ name: item.name });
      if (!existing) {
        await shopCollection.insertOne({ _id: new mongoose.Types.UUID().toString(), ...item });
        console.log(`Inserted ${item.name}`);
      } else {
        await shopCollection.updateOne({ name: item.name }, { $set: item });
        console.log(`Updated ${item.name}`);
      }
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

addItems();
