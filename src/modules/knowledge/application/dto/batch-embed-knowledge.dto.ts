import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BatchEmbedKnowledgeDto {
  /**
   * List of KnowledgeSource MongoDB ObjectId strings to (re-)embed.
   * Leave empty to embed ALL pending documents (handled by the service
   * when this DTO is omitted or ids array is empty).
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
