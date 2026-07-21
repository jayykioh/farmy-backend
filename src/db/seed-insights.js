/**
 * seed-insights.js
 *
 * Script seed dữ liệu báo cáo phân tích tuần (Weekly Insights)
 * cho tài khoản vutiendung@gmail.com để kiểm tra bộ lọc (filter theo tuần & mùa vụ).
 *
 * Chạy: node src/db/seed-insights.js
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const MONGO_URI = 'mongodb+srv://adnparr_db_user:Dong1234@farmdiaries.ytxyxvl.mongodb.net/Farm_Diaries?appName=FarmDiaries';
const TARGET_EMAIL = 'vutiendung@gmail.com';

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const userSchema = new mongoose.Schema({
  _id: String,
  email: String,
}, { collection: 'users' });

const farmPlotSchema = new mongoose.Schema({
  _id: String,
  user_id: String,
  name: String,
}, { collection: 'farm_plots' });

const diarySchema = new mongoose.Schema({
  _id: String,
  plot_id: String,
  crop_type: String,
  season: String,
  status: String,
}, { collection: 'diaries' });

const weeklyInsightSchema = new mongoose.Schema({
  _id: String,
  user_id: String,
  diary_id: String,
  crop_type: String,
  season: String,
  week_start_date: Date,
  insight_text: String,
  model_used: String,
  tokens_used: Number,
  created_at: Date,
}, { collection: 'weekly_insights', timestamps: false });

const User = mongoose.model('User', userSchema);
const FarmPlot = mongoose.model('FarmPlot', farmPlotSchema);
const Diary = mongoose.model('Diary', diarySchema);
const WeeklyInsight = mongoose.model('WeeklyInsight', weeklyInsightSchema);

async function runSeed() {
  try {
    console.log('📡 Đang kết nối tới MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Đã kết nối MongoDB thành công!');

    const user = await User.findOne({ email: TARGET_EMAIL });
    if (!user) {
      console.error(`❌ Không tìm thấy user với email: ${TARGET_EMAIL}`);
      process.exit(1);
    }
    console.log(`👤 Đã tìm thấy User: ${user.email} (id=${user._id})`);

    // Lấy danh sách farm_plots của user
    const plots = await FarmPlot.find({ user_id: user._id });
    const plotIds = plots.map((p) => p._id);

    // Lấy danh sách diaries
    let diaries = await Diary.find({ plot_id: { $in: plotIds } });
    console.log(`🌾 Tìm thấy ${diaries.length} mùa vụ của user.`);

    if (diaries.length === 0) {
      console.log('🌱 Đang tạo 2 mùa vụ mẫu cho user...');
      const dummyPlot = plots[0] || await FarmPlot.create({
        _id: crypto.randomUUID(),
        user_id: user._id,
        name: 'Vườn chính',
      });

      const diary1 = await Diary.create({
        _id: crypto.randomUUID(),
        plot_id: dummyPlot._id,
        crop_type: 'Sầu Riêng Ri6',
        season: 'Mùa Vụ 2026',
        status: 'active',
      });

      const diary2 = await Diary.create({
        _id: crypto.randomUUID(),
        plot_id: dummyPlot._id,
        crop_type: 'Dưa Leo Nhật',
        season: 'Hè Thu 2026',
        status: 'active',
      });

      diaries = [diary1, diary2];
    }

    // Các mốc tuần
    const now = new Date();
    const currentMonday = getMondayOf(now);

    const week1 = new Date(currentMonday); // Tuần này (20/07/2026)
    const week2 = new Date(currentMonday);
    week2.setUTCDate(week2.getUTCDate() - 7); // Tuần trước (13/07/2026)
    const week3 = new Date(currentMonday);
    week3.setUTCDate(week3.getUTCDate() - 14); // 2 tuần trước (06/07/2026)

    const seedInsightsData = [];

    // Tìm diary sầu riêng & dưa leo
    const sauRiengDiary = diaries.find(d => d.crop_type.includes('Sầu') || d.crop_type.includes('Ri6')) || diaries[0];
    const duaLeoDiary = diaries.find(d => d.crop_type.includes('Dưa') || d.crop_type.includes('Leo')) || diaries[1] || diaries[0];

    // 1. Sầu riêng Ri6 - Tuần 20/07/2026
    seedInsightsData.push({
      _id: crypto.randomUUID(),
      user_id: user._id,
      diary_id: sauRiengDiary._id,
      crop_type: sauRiengDiary.crop_type || 'Sầu Riêng Ri6',
      season: sauRiengDiary.season || 'Mùa Vụ 2026',
      week_start_date: week1,
      insight_text: `Chào bạn, tôi là chuyên gia nông nghiệp đồng hành cùng bạn. Dựa trên nhật ký canh tác của bạn từ ngày 13/07 đến 20/07/2026, tôi xin gửi đến bạn bản phân tích chuyên sâu cho vườn **${sauRiengDiary.crop_type}**:

## 📊 Đánh giá hoạt động tuần qua

Tuần qua, bạn đã có những thao tác kỹ thuật rất kịp thời và chuyên nghiệp:
* **Quản lý dinh dưỡng:** Việc phun Boron hỗ trợ đậu quả và bổ sung MgSO4 cho các gốc vàng lá là quyết định chính xác, giúp cây cân bằng sinh lý trong giai đoạn nhạy cảm.
* **Quản lý hạ tầng:** Việc kiểm tra và thay thế đầu tưới nhỏ giọt bị tắc giúp cây không bị sốc nước sau các đợt mưa lớn.
* **Kỹ thuật thụ phấn:** Thụ phấn bổ sung vào khung giờ vàng (5-7h sáng) đạt kết quả rất khả quan (120-150 quả/cây).

## 💡 Khuyến nghị kỹ thuật cụ thể

1. **Kiểm soát độ ẩm sau mưa:** Sau các đợt mưa lớn, đất dễ bị úng cục bộ, tạo điều kiện cho nấm *Phytophthora* phát triển. Cần chú ý thoát nước tốt ở chân mô.
2. **Theo dõi nhện đỏ:** Thời tiết xen kẽ nắng mưa làm mật độ nhện đỏ tăng nhẹ ở mặt dưới lá già. Nên phun xịt nước áp lực cao hoặc dùng chế phẩm sinh học phòng ngừa.`,
      model_used: 'gemini-1.5-flash',
      tokens_used: 1150,
      created_at: new Date(),
    });

    // 2. Dưa Leo Nhật - Tuần 20/07/2026
    seedInsightsData.push({
      _id: crypto.randomUUID(),
      user_id: user._id,
      diary_id: duaLeoDiary._id,
      crop_type: duaLeoDiary.crop_type || 'Dưa Leo Nhật',
      season: duaLeoDiary.season || 'Hè Thu 2026',
      week_start_date: week1,
      insight_text: `Chào bạn, dưới đây là báo cáo phân tích cho **${duaLeoDiary.crop_type}** (${duaLeoDiary.season}) trong tuần 20/07/2026:

## 📊 Đánh giá sinh trưởng trong nhà màng

* **Tỉa lá già & Bấm ngọn:** Cây đang ở giai đoạn rộ quả, việc bạn bấm ngọn chèo từ lá thứ 2 giúp dinh dưỡng tập trung tối đa nuôi trái thẳng, đều màu.
* **Hệ thống tưới & EC:** Chỉ số EC duy trì ở mức 2.2 ms/cm và pH 6.2 rất lý tưởng cho dưa leo giai đoạn thu hoạch rộ.

## 🎯 Lời khuyên tuần tới

* **Tần suất thu hoạch:** Nên thu hoạch dưa leo 2 ngày/lần vào buổi sáng sớm để tránh quả bị quá lứa và giảm tải cho thân cây.
* **Bổ sung Calcium-Boron:** Giúp vỏ quả bóng đẹp, giòn ngọt và giảm nguy cơ nứt quả do chênh lệch nhiệt độ nhà màng.`,
      model_used: 'gemini-1.5-flash',
      tokens_used: 980,
      created_at: new Date(),
    });

    // 3. Sầu Riêng Ri6 - Tuần 13/07/2026 (Tuần trước)
    seedInsightsData.push({
      _id: crypto.randomUUID(),
      user_id: user._id,
      diary_id: sauRiengDiary._id,
      crop_type: sauRiengDiary.crop_type || 'Sầu Riêng Ri6',
      season: sauRiengDiary.season || 'Mùa Vụ 2026',
      week_start_date: week2,
      insight_text: `Báo cáo phân tích tuần từ 06/07 đến 13/07/2026 cho mùa vụ **${sauRiengDiary.crop_type}**:

## 🌿 Điểm sáng tuần qua

* **Xử lý ra hoa:** Các mầm hoa (mắt cua) đã nhú đều trên cành cấp 1. Việc bạn siết nước 7 ngày vừa qua đạt hiệu quả cao.
* **Dọn dẹp tàn dư:** Đã dọn sạch cỏ dại quanh gốc giúp thông thoáng béc tưới.

## ⚠️ Lưu ý kỹ thuật

* **Nhấp nước lại:** Bắt đầu nhấp nước lại với lượng 20-30% dung tích tưới bình thường để rễ cây thích nghi trở lại, tránh sốc nước gây rụng mắt cua.`,
      model_used: 'gemini-1.5-flash',
      tokens_used: 850,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    // 4. Dưa Leo Nhật - Tuần 13/07/2026 (Tuần trước)
    seedInsightsData.push({
      _id: crypto.randomUUID(),
      user_id: user._id,
      diary_id: duaLeoDiary._id,
      crop_type: duaLeoDiary.crop_type || 'Dưa Leo Nhật',
      season: duaLeoDiary.season || 'Hè Thu 2026',
      week_start_date: week2,
      insight_text: `Báo cáo phân tích tuần từ 06/07 đến 13/07/2026 cho mùa vụ **${duaLeoDiary.crop_type}**:

## 🌱 Đánh giá tuần vươn giàn

* **Treo dây & Lồng giàn:** Dàn dưa leo leo vươn ngọn đạt chiều cao 1.5m, mật độ thân cây đồng đều.
* **Phòng bọ trĩ:** Việc đặt bẫy dính vàng quanh nhà màng giúp giám sát tốt bọ trĩ và ruồi đục lá.

## 📌 Khuyến nghị

* Giữ độ ẩm giá thể ổn định ở 70-75%, bổ sung đạm nitrat và kali hòa tan để ngọn dưa mập khỏe trước khi rộ hoa.`,
      model_used: 'gemini-1.5-flash',
      tokens_used: 890,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    // 5. Sầu Riêng Ri6 - Tuần 06/07/2026 (2 tuần trước)
    seedInsightsData.push({
      _id: crypto.randomUUID(),
      user_id: user._id,
      diary_id: sauRiengDiary._id,
      crop_type: sauRiengDiary.crop_type || 'Sầu Riêng Ri6',
      season: sauRiengDiary.season || 'Mùa Vụ 2026',
      week_start_date: week3,
      insight_text: `Báo cáo phân tích tuần từ 29/06 đến 06/07/2026 cho **${sauRiengDiary.crop_type}**:

## 🛠️ Phân tích giai đoạn làm cơi lá 3

* Bộ lá cơi 3 đã lụa dày, xanh đen dầy dặn. Đây là tiền đề rất tốt trước khi tiến hành quy trình siết nước phân hóa mầm hoa.
* Đã bón bổ sung Lân vi lượng qua lá để thúc đẩy lá già nhanh và đều.`,
      model_used: 'gemini-1.5-flash',
      tokens_used: 760,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    });

    // Tiến hành xóa các insight cũ của user để seed lại sạch sẽ
    await WeeklyInsight.deleteMany({ user_id: user._id });
    console.log('🧹 Đã dọn dẹp các bản ghi insight cũ của user.');

    await WeeklyInsight.insertMany(seedInsightsData);
    console.log(`🎉 ĐÃ SEED THÀNH CÔNG ${seedInsightsData.length} BẢN BÁO CÁO INSIGHT CHO USER ${TARGET_EMAIL}!`);
    console.log('📌 Danh sách báo cáo đã seed:');
    seedInsightsData.forEach((ins, idx) => {
      console.log(`  ${idx + 1}. Mùa vụ: ${ins.crop_type} (${ins.season}) | Tuần: ${ins.week_start_date.toISOString().slice(0, 10)}`);
    });

    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB.');
  } catch (err) {
    console.error('❌ Lỗi khi seed insights:', err);
    process.exit(1);
  }
}

runSeed();
