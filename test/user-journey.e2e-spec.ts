/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LLMService } from '../src/modules/ai/application/services/llm.service';
import cookieParser from 'cookie-parser';

describe('User Journey (Auth -> Diary -> Chat) (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let plotId: string;
  let diaryId: string;
  let logId: string;
  let sessionId: string;

  // 1. Mock LLM Service to avoid real Gemini API calls
  const mockLLMService = {
    embed: jest.fn().mockResolvedValue({
      vector: new Array(768).fill(0.1),
      tokensUsed: 5,
    }),
    complete: jest.fn().mockResolvedValue({
      text: 'Đây là câu trả lời từ AI (Mocked) dựa trên nhật ký của bạn: Bạn đã bón phân trùn quế.',
      promptTokens: 10,
      completionTokens: 20,
    }),
    streamComplete: jest.fn(),
    completeVision: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLMService)
      .useValue(mockLLMService)
      .compile();

    app = moduleFixture.createNestApplication({
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    // 3. Cleanup Resources
    if (sessionId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/chat/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
    }
    if (logId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/diaries/logs/${logId}`)
        .set('Authorization', `Bearer ${accessToken}`);
    }
    if (diaryId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/diaries/${diaryId}`)
        .set('Authorization', `Bearer ${accessToken}`);
    }
    if (plotId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${plotId}`)
        .set('Authorization', `Bearer ${accessToken}`);
    }
    await app.close();
  });

  // Step 1: Authentication
  it('Step 1 - should login successfully and get access token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@farmy.com',
        password: 'UserPassword123',
      });
    
    if (loginRes.status !== 201) {
      console.error('Login failed:', loginRes.body);
    }

    expect(loginRes.status).toBe(201);
    expect(loginRes.body.success).toBe(true);
    accessToken = loginRes.body.data.access_token;
    expect(accessToken).toBeDefined();
  });

  // Step 2: Farm & Diary Setup
  it('Step 2 - should create a farm plot', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/plots')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Vườn tích hợp E2E',
        area_size: 50,
        description: 'Vườn dùng cho luồng User Journey',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    plotId = res.body.data._id;
  });

  it('Step 3 - should create a crop diary', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/diaries')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        plot_id: plotId,
        crop_type: 'Cà chua E2E',
        start_date: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    diaryId = res.body.data._id;
  });

  // Step 3: Activity Logging
  it('Step 4 - should log a daily activity', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/diaries/${diaryId}/logs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        activity_type: 'Bón phân',
        content: 'Bón phân trùn quế đợt 1 cho cà chua.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    logId = res.body.data._id;
  });

  // Step 4: AI Chat Interaction
  it('Step 5 - should chat with AI and get mocked response', async () => {
    // Decode user ID from token
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    const userId = payload.sub;

    // Manual insert to bypass flaky BullMQ timing
    const embeddingRepo = app.get(require('../src/modules/ai/infrastructure/persistence/embedding.repository').EmbeddingRepository);
    await embeddingRepo.upsertMany([{
      sourceId: logId,
      sourceType: 'diary_log',
      chunkIndex: 0,
      contentHash: 'dummy',
      text: 'Bón phân trùn quế', // Provide text to satisfy NOT NULL constraint
      vector: new Array(768).fill(0.1),
      metadata: { user_id: userId },
      isActive: true
    }]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/message')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        content: 'Tôi đã bón phân gì cho cà chua?',
      });

    if (res.status !== 200) {
      throw new Error(`Failed to chat: ${res.status} - ${JSON.stringify(res.body)}`);
    }

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    // Response should be the mock text
    expect(res.body.data.response.content).toContain('Đây là câu trả lời từ AI (Mocked)');
    
    // Save session ID for cleanup
    sessionId = res.body.data.session_id;
    expect(sessionId).toBeDefined();

    // Verify LLMService was actually called with the RAG context
    console.log('embed calls:', mockLLMService.embed.mock.calls.length);
    console.log('embed calls args:', mockLLMService.embed.mock.calls);
    expect(mockLLMService.complete).toHaveBeenCalled();
    const callArgs = mockLLMService.complete.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Bón phân trùn quế');
  }, 15000);
});
