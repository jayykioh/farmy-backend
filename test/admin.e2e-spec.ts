import { webcrypto } from 'crypto';
if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
  });
}
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';

describe('Admin Module (e2e)', () => {
  let app: INestApplication<App>;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.use(cookieParser());
    await app.init();

    // 1. Get standard user token
    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@farmy.com',
        password: 'UserPassword123',
      });
    userToken = userLogin.body.data?.access_token;

    // 2. Get admin token
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@farmy.com',
        password: 'AdminPassword123',
      });
    adminToken = adminLogin.body.data?.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('RBAC Authorization', () => {
    it('should deny access to stats endpoint without token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/admin/stats');
      expect(res.status).toBe(401);
    });

    it('should deny access to stats endpoint for regular user role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(432).or = 403; // In roles.guard it throws AUTH_FORBIDDEN (which is 403)
      expect(res.body.success).toBe(false);
    });

    it('should allow access to stats endpoint for admin role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview).toBeDefined();
    });
  });

  describe('Admin Operations', () => {
    it('should list users with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThan(0);
    });

    it('should list plant scans', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/scans?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scans).toBeInstanceOf(Array);
    });

    it('should get and update dynamic config', async () => {
      // Get current config
      const resGet = await request(app.getHttpServer())
        .get('/api/v1/admin/config')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resGet.status).toBe(200);
      expect(resGet.body.data.maintenanceMode).toBe(false);

      // Turn on maintenance mode
      const resPost = await request(app.getHttpServer())
        .post('/api/v1/admin/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maintenanceMode: true, rateLimit: 250 });
      expect(resPost.status).toBe(201).or = 200;
      expect(resPost.body.data.maintenanceMode).toBe(true);
      expect(resPost.body.data.rateLimit).toBe(250);

      // Verify a regular user request is now blocked by maintenance mode
      const resBlocked = await request(app.getHttpServer())
        .get('/api/v1/plots')
        .set('Authorization', `Bearer ${userToken}`);
      expect(resBlocked.status).toBe(503); // Service Unavailable due to maintenance mode
      expect(resBlocked.body.error_code || resBlocked.body.message).toContain(
        'MAINTENANCE_MODE',
      );

      // Reset maintenance mode back to false
      const resReset = await request(app.getHttpServer())
        .post('/api/v1/admin/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maintenanceMode: false, rateLimit: 100 });
      expect(resReset.status).toBe(201).or = 200;
      expect(resReset.body.data.maintenanceMode).toBe(false);
    });
  });
});
