/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Farm CRUD (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let plotId: string;
  let diaryId: string;
  let logId: string;
  let reminderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Log in with the seeded test user to get an access token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@farmy.com',
        password: 'UserPassword123',
      });

    expect(loginRes.status).toBe(201); // login returns 201 due to POST
    accessToken = loginRes.body.data.accessToken;
    expect(accessToken).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Plot CRUD
  it('should create a new plot (POST /api/v1/plots)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/plots')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Vườn thực nghiệm E2E',
        area_size: 120.5,
        description: 'Vườn tạo bởi kiểm thử tự động E2E',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBeDefined();
    plotId = res.body.data._id;
  });

  it('should retrieve plots list (GET /api/v1/plots)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/plots')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const createdPlot = res.body.data.find((p: any) => p._id === plotId);
    expect(createdPlot).toBeDefined();
    expect(createdPlot.name).toBe('Vườn thực nghiệm E2E');
  });

  // 2. Diary CRUD
  it('should create a crop diary on the plot (POST /api/v1/diaries)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/diaries')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        plot_id: plotId,
        crop_type: 'Dưa lưới E2E',
        start_date: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBeDefined();
    diaryId = res.body.data._id;
  });

  it('should retrieve diaries list (GET /api/v1/diaries)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/diaries')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const createdDiary = res.body.data.find((d: any) => d._id === diaryId);
    expect(createdDiary).toBeDefined();
    expect(createdDiary.crop_type).toBe('Dưa lưới E2E');
  });

  // 3. DiaryLog CRUD
  it('should create a daily log for the diary (POST /api/v1/diaries/:diaryId/logs)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/diaries/${diaryId}/logs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        activity_type: 'Bón phân',
        content: 'Bón lót phân trùn quế cho dưa lưới con.',
        image_url: 'https://example.com/test-image.jpg',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBeDefined();
    logId = res.body.data._id;
  });

  it('should retrieve logs list for the diary (GET /api/v1/diaries/:diaryId/logs)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/diaries/${diaryId}/logs`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const createdLog = res.body.data.find((l: any) => l._id === logId);
    expect(createdLog).toBeDefined();
    expect(createdLog.content).toBe('Bón lót phân trùn quế cho dưa lưới con.');
  });

  // 4. Reminder CRUD
  it('should create a reminder (POST /api/v1/reminders)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reminders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Tưới nước dưa lưới kiểm thử',
        remind_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        diary_id: diaryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBeDefined();
    reminderId = res.body.data._id;
  });

  it('should retrieve pending reminders (GET /api/v1/reminders/pending)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reminders/pending')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const createdReminder = res.body.data.find(
      (r: any) => r._id === reminderId,
    );
    expect(createdReminder).toBeDefined();
  });

  it('should mark the reminder as completed (PATCH /api/v1/reminders/:id/complete)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reminders/${reminderId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_sent).toBe(true);
  });

  // 5. Cleanup
  it('should clean up created resources successfully', async () => {
    // delete reminder
    await request(app.getHttpServer())
      .delete(`/api/v1/reminders/${reminderId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // delete log
    await request(app.getHttpServer())
      .delete(`/api/v1/diaries/logs/${logId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // delete diary (soft delete, sets status to deleted)
    await request(app.getHttpServer())
      .delete(`/api/v1/diaries/${diaryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // delete plot
    await request(app.getHttpServer())
      .delete(`/api/v1/plots/${plotId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
  });
});
