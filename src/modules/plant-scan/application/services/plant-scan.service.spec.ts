import { PlantScanService } from './plant-scan.service';
import { PetMood } from '../../../pet/infrastructure/persistence/pet-state.schema';
import { Logger } from '@nestjs/common';

describe('PlantScanService', () => {
  const file = {
    buffer: Buffer.from('image'),
    size: 1024,
  };

  function createService(options: { petUpdateRejects?: boolean } = {}) {
    const save = jest.fn().mockResolvedValue(undefined);
    const ScanModel = jest.fn().mockImplementation((data) => ({
      ...data,
      save,
    }));
    ScanModel.find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

    const rateLimiter = {
      consume: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 }),
    };
    const llmService = {
      completeVision: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          is_plant: true,
          disease_name: 'Bệnh đạo ôn',
          confidence: 0.91,
          symptoms: ['Vết bệnh hình thoi'],
          treatment: { chemical: 'Phun thuốc theo nhãn', organic: 'Giữ ruộng thông thoáng' },
        }),
      }),
    };
    const promptService = {
      buildVisionPrompt: jest.fn().mockReturnValue({ prompt: 'vision prompt', promptVersion: 'vision_v1.0' }),
    };
    const storageService = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.test/image.webp'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const imageProcessor = {
      validateImageMagicBytes: jest.fn().mockResolvedValue(undefined),
      checkBlurry: jest.fn().mockResolvedValue(false),
      optimizeImage: jest.fn().mockResolvedValue(Buffer.from('optimized')),
      computePHash: jest.fn().mockResolvedValue('101010'),
      createThumbnail: jest.fn().mockResolvedValue(Buffer.from('thumb')),
      hammingDistance: jest.fn().mockReturnValue(64),
    };
    const guardrailService = {
      applyBVTVGuardrail: jest.fn((diagnosis) => diagnosis),
    };
    const petService = {
      updateMood: options.petUpdateRejects
        ? jest.fn().mockRejectedValue(new Error('pet unavailable'))
        : jest.fn().mockResolvedValue(undefined),
    };

    const service = new (PlantScanService as any)(
      ScanModel,
      rateLimiter,
      llmService,
      promptService,
      storageService,
      imageProcessor,
      guardrailService,
      petService,
    ) as PlantScanService;

    return { service, petService };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates the pet mood to worried after a high-confidence disease diagnosis', async () => {
    const { service, petService } = createService();

    await service.diagnose(file, 'Lúa', 'user-1');

    expect(petService.updateMood).toHaveBeenCalledWith(
      'user-1',
      PetMood.WORRIED,
      expect.stringContaining('Bệnh đạo ôn'),
    );
  });

  it('still returns the scan result when pet mood sync fails', async () => {
    const { service } = createService({ petUpdateRejects: true });

    await expect(service.diagnose(file, 'Lúa', 'user-1')).resolves.toMatchObject({
      status: 'completed',
      diagnosis: expect.objectContaining({ disease_name: 'Bệnh đạo ôn' }),
    });
  });
});
