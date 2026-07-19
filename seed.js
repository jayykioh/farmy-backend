const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://adnparr_db_user:Dong1234@farmdiaries.ytxyxvl.mongodb.net/Farm_Diaries?appName=FarmDiaries";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("Farm_Diaries");
    
    // Seed cho Pet States
    const petColl = db.collection("pet_states"); // Cần lấy tên bảng đúng, thường là pet_states hoặc petstates, Mongoose lưu là petstates
    
    // Kiểm tra tên collections
    const collections = await db.listCollections().toArray();
    const petCollectionName = collections.find(c => c.name.includes('pet'))?.name || 'petstates';
    
    console.log(`Đang update collection: ${petCollectionName}`);
    
    const result = await db.collection(petCollectionName).updateMany(
      {},
      {
        $set: {
          streak_count: 50,       // Chuỗi 50 ngày liên tiếp
          level: 30,              // Level 30
          xp: 1500,               // 1500 XP dư
          mood: "excited",        // Tâm trạng cực kỳ vui
          mood_reason: "STREAK_MILESTONE",
          missed_days: 0          // Không lỡ ngày nào
        }
      }
    );
    console.log(`Đã seed thành công! Updated ${result.modifiedCount} accounts.`);
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
