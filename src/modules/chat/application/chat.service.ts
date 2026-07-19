import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LLMService } from '../../ai/application/services/llm.service';
import { PromptService } from '../../ai/application/services/prompt.service';
import type { VisionCompleteOptions } from '../../ai/domain/llm.types';
import { PetMoodInput } from '../../ai/domain/prompt.types';
import { PetService } from '../../pet/application/services/pet.service';
import { RagService } from '../../rag/application/rag.service';
import { SubmitFeedbackDto } from '../interface/dtos/feedback.dto';
import { StreamChatDto } from '../interface/dtos/stream-chat.dto';
import {
  ChatMessageDocument,
  ChatMessageStatus,
} from '../infrastructure/persistence/chat-message.schema';
import { ChatSessionDocument } from '../infrastructure/persistence/chat-session.schema';
import { AiFeedbackDocument } from '../../ai/infrastructure/persistence/ai-feedback.schema';
import {
  BoundedChatHistory,
  CompletedTurn,
  PreparedChatTurn,
} from './chat.types';

const DEFAULT_HISTORY_MAX_MESSAGES = 20;
const DEFAULT_HISTORY_MAX_CHARS = 12_000;
const CHAT_IMAGE_MARKER_REGEX = /\[IMAGE:(https?:\/\/[^\]\s]+)\]/i;
const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const SUPPORTED_CHAT_IMAGE_MIME_TYPES = new Set<
  VisionCompleteOptions['mimeType']
>(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatSessionDocument.name)
    private readonly sessionModel: Model<ChatSessionDocument>,
    @InjectModel(ChatMessageDocument.name)
    private readonly messageModel: Model<ChatMessageDocument>,
    private readonly ragService: RagService,
    private readonly promptService: PromptService,
    private readonly llmService: LLMService,
    private readonly petService: PetService,
    @InjectModel(AiFeedbackDocument.name)
    private readonly feedbackModel: Model<AiFeedbackDocument>,
  ) {}

  async prepareTurn(
    userId: string,
    userName: string,
    dto: StreamChatDto,
  ): Promise<PreparedChatTurn> {
    const existing = await this.messageModel
      .findOne({ user_id: userId, client_message_id: dto.client_message_id })
      .exec();

    let session: ChatSessionDocument;
    let userMessage: ChatMessageDocument;
    let isFirstTurn = false;

    if (existing) {
      this.rejectNonRetryable(existing.status);
      session = await this.getOwnedSession(
        userId,
        existing.session_id.toString(),
      );
      if (dto.session_id && dto.session_id !== session._id.toString()) {
        throw new ConflictException({
          code: 'MESSAGE_SESSION_MISMATCH',
          message: 'The client message belongs to a different session.',
        });
      }
      const retried = await this.messageModel.findOneAndUpdate(
        { _id: existing._id, user_id: userId, status: 'failed' },
        { $set: { status: 'pending' } },
        { new: true },
      );
      if (!retried) {
        const current = await this.messageModel.findById(existing._id).exec();
        this.rejectNonRetryable(current?.status ?? 'pending');
        throw new ConflictException({
          code: 'MESSAGE_IN_PROGRESS',
          message: 'This message is already being processed.',
        });
      }
      userMessage = retried;
    } else {
      isFirstTurn = !dto.session_id;
      session = await this.getOrCreateSession(
        userId,
        dto.session_id,
        dto.message,
      );
      try {
        userMessage = await this.messageModel.create({
          session_id: session._id,
          user_id: userId,
          role: 'user',
          content: dto.message,
          status: 'pending',
          client_message_id: dto.client_message_id,
        });
      } catch (error) {
        if (!this.isDuplicateKey(error)) throw error;
        const duplicate = await this.messageModel
          .findOne({
            user_id: userId,
            client_message_id: dto.client_message_id,
          })
          .exec();
        this.rejectNonRetryable(duplicate?.status ?? 'pending');
        throw error;
      }
    }

    const imageAttachment = this.extractImageAttachment(userMessage.content);
    const promptUserMessage = imageAttachment.text;

    let history: BoundedChatHistory;
    let ragContext: Awaited<ReturnType<RagService['retrieveContext']>>;
    let petState: { mood: PetMoodInput; streakCount: number };
    try {
      [history, ragContext, petState] = await Promise.all([
        this.loadBoundedHistory(session._id.toString(), userId),
        this.ragService.retrieveContext(promptUserMessage, userId),
        this.loadPetState(userId),
      ]);
    } catch (error) {
      await this.failTurn(userMessage._id.toString(), userId);
      throw error;
    }

    const builtPrompt = this.promptService.buildChatPrompt({
      userName,
      streakCount: petState.streakCount,
      petMood: petState.mood,
      ragContext: ragContext.context_text,
      chatHistory: history,
      userMessage: promptUserMessage,
    });

    return {
      sessionId: session._id.toString(),
      userMessageId: userMessage._id.toString(),
      userId,
      prompt: builtPrompt.prompt,
      promptVersion: builtPrompt.promptVersion,
      retrievalStatus: ragContext.retrieval_status,
      citations: ragContext.citations,
      isFirstTurn,
      imageUrl: imageAttachment.imageUrl,
    };
  }

  streamCompletion(turn: PreparedChatTurn): AsyncGenerator<string, void, void> {
    if (turn.imageUrl) {
      return this.streamVisionCompletion(turn);
    }

    return this.llmService.streamComplete({
      prompt: turn.prompt,
      promptVersion: turn.promptVersion,
      userId: turn.userId,
    });
  }

  private async *streamVisionCompletion(
    turn: PreparedChatTurn,
  ): AsyncGenerator<string, void, void> {
    const image = await this.fetchChatImage(turn.imageUrl!);
    yield* this.llmService.streamCompleteVision({
      prompt: turn.prompt,
      promptVersion: turn.promptVersion,
      userId: turn.userId,
      imageBuffer: image.buffer,
      mimeType: image.mimeType,
    });
  }

  async getOrCreateSession(
    userId: string,
    sessionId: string | undefined,
    firstMessage: string,
  ): Promise<ChatSessionDocument> {
    if (sessionId) return this.getOwnedSession(userId, sessionId);

    const title = firstMessage.trim().slice(0, 60);
    return this.sessionModel.create({
      user_id: userId,
      title,
      last_message_at: new Date(),
    });
  }

  async loadBoundedHistory(
    sessionId: string,
    userId: string,
  ): Promise<BoundedChatHistory> {
    await this.getOwnedSession(userId, sessionId);
    const maxMessages = this.positiveEnvInt(
      'CHAT_HISTORY_MAX_MESSAGES',
      DEFAULT_HISTORY_MAX_MESSAGES,
    );
    const maxChars = this.positiveEnvInt(
      'CHAT_HISTORY_MAX_CHARS',
      DEFAULT_HISTORY_MAX_CHARS,
    );
    const messages = await this.messageModel
      .find({
        session_id: new Types.ObjectId(sessionId),
        user_id: userId,
        status: 'completed',
      })
      .sort({ created_at: -1 })
      .limit(maxMessages)
      .exec();

    const chronological = messages.reverse();
    const users = new Map(
      chronological
        .filter((message) => message.role === 'user')
        .map((message) => [message._id.toString(), message]),
    );
    const pairs = chronological
      .filter(
        (message) =>
          message.role === 'assistant' &&
          message.reply_to_message_id &&
          users.has(message.reply_to_message_id.toString()),
      )
      .map((assistant) => ({
        user: users.get(assistant.reply_to_message_id!.toString())!,
        assistant,
      }));

    const kept: typeof pairs = [];
    let chars = 0;
    for (let index = pairs.length - 1; index >= 0; index -= 1) {
      const pair = pairs[index];
      const pairChars =
        pair.user.content.length + pair.assistant.content.length;
      if (chars + pairChars > maxChars) break;
      kept.push(pair);
      chars += pairChars;
    }

    return kept.reverse().flatMap((pair) => [
      { role: 'user' as const, content: pair.user.content },
      { role: 'assistant' as const, content: pair.assistant.content },
    ]);
  }

  private extractImageAttachment(content: string): {
    text: string;
    imageUrl?: string;
  } {
    const match = content.match(CHAT_IMAGE_MARKER_REGEX);
    const text = content.replace(CHAT_IMAGE_MARKER_REGEX, '').trim();

    return {
      text: text || 'Bạn có thể phân tích bức ảnh này giúp tôi được không?',
      imageUrl: match?.[1],
    };
  }

  private async fetchChatImage(imageUrl: string): Promise<{
    buffer: Buffer;
    mimeType: VisionCompleteOptions['mimeType'];
  }> {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new BadRequestException({
        code: 'CHAT_IMAGE_URL_INVALID',
        message: 'Attached image URL is invalid.',
      });
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException({
        code: 'CHAT_IMAGE_URL_UNSUPPORTED',
        message: 'Attached image URL must use http or https.',
      });
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new BadRequestException({
        code: 'CHAT_IMAGE_FETCH_FAILED',
        message: `Attached image could not be fetched (${response.status}).`,
      });
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > CHAT_IMAGE_MAX_BYTES) {
      throw new BadRequestException({
        code: 'CHAT_IMAGE_TOO_LARGE',
        message: 'Attached image is too large.',
      });
    }

    const mimeType = this.resolveChatImageMimeType(
      response.headers.get('content-type'),
      url,
    );
    if (!mimeType) {
      throw new BadRequestException({
        code: 'CHAT_IMAGE_TYPE_UNSUPPORTED',
        message: 'Attached image must be JPEG, PNG, or WebP.',
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > CHAT_IMAGE_MAX_BYTES) {
      throw new BadRequestException({
        code: 'CHAT_IMAGE_TOO_LARGE',
        message: 'Attached image is too large.',
      });
    }

    return { buffer, mimeType };
  }

  private resolveChatImageMimeType(
    contentType: string | null,
    url: URL,
  ): VisionCompleteOptions['mimeType'] | undefined {
    const normalized = contentType?.split(';')[0]?.trim().toLowerCase();
    if (
      normalized &&
      SUPPORTED_CHAT_IMAGE_MIME_TYPES.has(
        normalized as VisionCompleteOptions['mimeType'],
      )
    ) {
      return normalized as VisionCompleteOptions['mimeType'];
    }

    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.webp')) return 'image/webp';
    return undefined;
  }

  async completeTurn(
    turn: PreparedChatTurn,
    assistantContent: string,
  ): Promise<CompletedTurn> {
    const mongoSession = await this.sessionModel.db.startSession();
    let assistantMessageId = '';
    try {
      await mongoSession.withTransaction(async () => {
        const created = await this.messageModel.create(
          [
            {
              session_id: new Types.ObjectId(turn.sessionId),
              user_id: turn.userId,
              role: 'assistant',
              content: assistantContent,
              status: 'completed',
              reply_to_message_id: new Types.ObjectId(turn.userMessageId),
            },
          ],
          { session: mongoSession },
        );
        assistantMessageId = created[0]._id.toString();

        const userUpdate = await this.messageModel.updateOne(
          {
            _id: new Types.ObjectId(turn.userMessageId),
            user_id: turn.userId,
            status: 'pending',
          },
          { $set: { status: 'completed' } },
          { session: mongoSession },
        );
        if (userUpdate.modifiedCount !== 1) {
          throw new InternalServerErrorException(
            'Chat turn state changed before completion.',
          );
        }

        const sessionSet: Record<string, unknown> = {
          last_message_at: new Date(),
        };
        if (turn.isFirstTurn !== false) {
          sessionSet.title = this.summarizeConversationTitle(assistantContent);
        }

        const sessionUpdate = await this.sessionModel.updateOne(
          { _id: new Types.ObjectId(turn.sessionId), user_id: turn.userId },
          { $set: sessionSet },
          { session: mongoSession },
        );
        if (sessionUpdate.matchedCount !== 1) {
          throw new InternalServerErrorException(
            'Chat session was not found during completion.',
          );
        }
      });
    } finally {
      await mongoSession.endSession();
    }
    return { assistantMessageId };
  }

  async failTurn(userMessageId: string, userId: string): Promise<void> {
    await this.messageModel.updateOne(
      {
        _id: new Types.ObjectId(userMessageId),
        user_id: userId,
        status: 'pending',
      },
      { $set: { status: 'failed' } },
    );
  }

  async listSessions(userId: string, page: number, limit: number) {
    const filter = { user_id: userId };
    const [items, total] = await Promise.all([
      this.sessionModel
        .find(filter)
        .select('_id title last_message_at created_at updated_at')
        .sort({ last_message_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.sessionModel.countDocuments(filter).exec(),
    ]);
    return { items, page, limit, total };
  }

  async listMessages(
    userId: string,
    sessionId: string,
    page: number,
    limit: number,
  ) {
    const session = await this.getOwnedSession(userId, sessionId);
    const filter = { session_id: session._id, user_id: userId };
    const [items, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .select('_id role content status reply_to_message_id created_at')
        .sort({ created_at: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel.countDocuments(filter).exec(),
    ]);
    return { items, page, limit, total };
  }

  async deleteSession(
    userId: string,
    sessionId: string,
  ): Promise<{ deleted: true }> {
    const session = await this.getOwnedSession(userId, sessionId);
    await this.messageModel
      .deleteMany({ session_id: session._id, user_id: userId })
      .exec();
    await this.sessionModel
      .deleteOne({ _id: session._id, user_id: userId })
      .exec();

    return { deleted: true };
  }

  async renameSession(
    userId: string,
    sessionId: string,
    title: string,
  ): Promise<Pick<ChatSessionDocument, '_id' | 'title' | 'last_message_at'>> {
    const session = await this.getOwnedSession(userId, sessionId);
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      throw new BadRequestException('Chat session title is required.');
    }

    const updated = await this.sessionModel
      .findOneAndUpdate(
        { _id: session._id, user_id: userId },
        { $set: { title: normalizedTitle } },
        {
          new: true,
          projection: '_id title last_message_at created_at updated_at',
        },
      )
      .exec();
    if (!updated) throw new NotFoundException('Chat session not found.');

    return updated;
  }

  async submitFeedback(dto: SubmitFeedbackDto, userId: string) {
    const feedback = new this.feedbackModel({
      _id: crypto.randomUUID(),
      session_id: dto.session_id,
      message_id: dto.message_id,
      user_id: userId,
      rating: dto.rating,
      helpful: dto.helpful,
      comment: dto.comment,
      model_used: 'gemini-1.5-flash',
      prompt_version: 'v1.0',
    });
    await feedback.save();
    return {
      success: true,
    };
  }

  private async getOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<ChatSessionDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('Invalid chat session id.');
    }
    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException('Chat session not found.');
    if (session.user_id !== userId) {
      throw new ForbiddenException('You do not own this chat session.');
    }
    return session;
  }

  private async loadPetState(
    userId: string,
  ): Promise<{ mood: PetMoodInput; streakCount: number }> {
    try {
      const state = await this.petService.getStatus(userId);
      if (!state) return { mood: 'neutral', streakCount: 0 };
      return { mood: state.mood, streakCount: state.streakCount };
    } catch {
      return { mood: 'neutral', streakCount: 0 };
    }
  }

  private rejectNonRetryable(status: ChatMessageStatus): void {
    if (status === 'failed') return;
    if (status === 'completed') {
      throw new ConflictException({
        code: 'MESSAGE_ALREADY_COMPLETED',
        message: 'This message was already completed.',
      });
    }
    throw new ConflictException({
      code: 'MESSAGE_IN_PROGRESS',
      message: 'This message is already being processed.',
    });
  }

  private isDuplicateKey(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000,
    );
  }

  private positiveEnvInt(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private summarizeConversationTitle(content: string): string {
    const normalized = content
      .replace(/[#*_`>~]/g, '')
      .replace(/\[[0-9]+\]/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    const cleaned = normalized
      .replace(/^(dạ[,!\s]+)?(chào|xin chào).+?(ạ|nhé)[,.!\s]+/i, '')
      .replace(/^dạ[,!\s]+/i, '')
      .trim();

    const sentence =
      cleaned
        .split(/(?<=[.!?])\s+|\n+/)
        .map((part) => part.replace(/[.!?]+$/g, '').trim())
        .find((part) => part.length >= 12) ?? cleaned;

    const title = this.capitalizeFirst(
      sentence || 'Cuộc trò chuyện với Bé Thóc',
    );
    if (title.length <= 60) return title;

    const truncated = title
      .slice(0, 57)
      .replace(/\s+\S*$/g, '')
      .trim();
    return truncated || title.slice(0, 57).trim();
  }

  private capitalizeFirst(value: string): string {
    return value.charAt(0).toLocaleUpperCase('vi-VN') + value.slice(1);
  }
}
