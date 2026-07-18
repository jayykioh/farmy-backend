import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

export function createPgvectorTypeOrmImports(
  connectionString?: string,
): DynamicModule[] {
  const url = connectionString?.trim();
  if (!url) return [];

  return [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url,
      autoLoadEntities: true,
      synchronize: false,
    }),
  ];
}
