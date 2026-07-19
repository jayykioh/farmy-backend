import { createPgvectorTypeOrmImports } from './pgvector-typeorm.module';

describe('createPgvectorTypeOrmImports', () => {
  it('does not register TypeORM when pgvector connection string is absent', () => {
    expect(createPgvectorTypeOrmImports(undefined)).toEqual([]);
    expect(createPgvectorTypeOrmImports('')).toEqual([]);
    expect(createPgvectorTypeOrmImports('   ')).toEqual([]);
  });

  it('registers TypeORM when pgvector connection string is configured', () => {
    const imports = createPgvectorTypeOrmImports(
      'postgresql://user:pass@localhost:5432/db',
    );

    expect(imports).toHaveLength(1);
  });
});
