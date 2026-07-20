import { ROLES_KEY } from '../../../../common/decorators/roles.decorator';
import { AiAdminController } from './ai-admin.controller';

describe('AiAdminController', () => {
  it('requires admin role for rebuild endpoint', () => {
    const classRoles = Reflect.getMetadata(ROLES_KEY, AiAdminController);
    const methodRoles = Reflect.getMetadata(ROLES_KEY, AiAdminController.prototype.rebuildEmbeddings);

    expect(classRoles ?? methodRoles).toEqual(['admin']);
  });

  it('rebuild enqueues only confirmed knowledge sources', async () => {
    const diaryLogModel = { find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) };
    const knowledgeSourceModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'knowledge-1', content: 'ok', validation_status: 'confirmed' },
        ]),
      }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const controller = new AiAdminController(diaryLogModel as any, knowledgeSourceModel as any, queue as any);

    await controller.rebuildEmbeddings();

    expect(knowledgeSourceModel.find).toHaveBeenCalledWith({ validation_status: 'confirmed' });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
