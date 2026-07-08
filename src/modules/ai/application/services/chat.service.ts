import { Injectable, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { AiChatDocument, ChatMessageSubdocument } from '../../infrastructure/persistence/ai-chat.schema';
import { AiFeedbackDocument } from '../../infrastructure/persistence/ai-feedback.schema';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';
import { PetService } from '../../../pet/application/services/pet.service';
import { RAGService, Citation } from './rag.service';
import { PromptService } from './prompt.service';
import { LLMService } from './llm.service';
import { LLM_SAFETY_MESSAGE, LLM_FALLBACK_MESSAGE } from '../../domain/llm.constants';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  session_id?: string;
}

export class SubmitFeedbackDto {
  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsNumber()
  @IsNotEmpty()
  rating: number;

  @IsBoolean()
  @IsOptional()
  helpful?: boolean;

  @IsString()
  @IsOptional()
  comment?: string;
}

const PHI_KEYWORDS = ['thuốc', 'phun', 'liều lượng', 'PHI', 'cách ly', 'trừ sâu', 'diệt cỏ', 'bảo vệ thực vật'];
const BANNED_PESTICIDES = ['paraquat', 'chlorpyrifos', 'carbofuran'];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel('AiChatDocument')
    private readonly chatModel: Model<AiChatDocument>,
    @InjectModel(AiFeedbackDocument.name)
    private readonly feedbackModel: Model<AiFeedbackDocument>,
    @InjectModel(UserDocument.name)
    private readonly userModel: Model<UserDocument>,
    private readonly petService: PetService,
    private readonly ragService: RAGService,
    private readonly promptService: PromptService,
    private readonly llmService: LLMService,
  ) {}

  private async getSession(sessionId: string, userId: string): Promise<AiChatDocument> {
    const session = await this.chatModel.findOne({ session_id: sessionId, user_id: userId }).exec();
    if (!session) {
      throw new HttpException('Phiên trò chuyện không tồn tại!', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  private async createSession(userId: string, firstMessage: string): Promise<AiChatDocument> {
    const title = firstMessage.substring(0, 50) || 'Trò chuyện mới';
    const session = new this.chatModel({
      _id: crypto.randomUUID(),
      user_id: userId,
      session_id: crypto.randomUUID(),
      title,
      messages: [],
    });
    return session.save();
  }

  async sendMessage(dto: SendMessageDto, userId: string) {
    // 1. Resolve or create session
    let session: AiChatDocument;
    if (dto.session_id) {
      session = await this.getSession(dto.session_id, userId);
    } else {
      session = await this.createSession(userId, dto.content);
    }

    // 2. Fetch user details & pet state
    const user = await this.userModel.findById(userId).exec();
    const userName = user?.name || 'Anh/Chị nhà nông';
    const petState = await this.petService.getStatus(userId);

    // 3. RAG Context retrieval
    const ragContext = await this.ragService.retrieveContext(dto.content, userId);

    // 4. Build prompt
    // Format messages for prompt history
    const history = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const builtPrompt = this.promptService.buildChatPrompt({
      userName,
      streakCount: petState.streakCount,
      petMood: petState.mood,
      ragContext: ragContext.context_text,
      chatHistory: history,
      userMessage: dto.content,
    });

    // 5. Check Content Moderation: Refuse non-agri topics upfront if needed
    const nonAgriKeywords = ['code', 'javascript', 'html', 'python', 'chính trị', 'bạo lực', 'phim', 'ca nhạc', 'y tế', 'pháp luật', 'tài chính'];
    const hasNonAgri = nonAgriKeywords.some((k) => dto.content.toLowerCase().includes(k));

    let responseContent: string;
    let isSafetyBlocked = false;
    let confidence = 0.85; // Default confidence
    let citations: Citation[] = ragContext.citations;

    if (hasNonAgri) {
      responseContent = 'Dạ, tôi là chuyên gia nông nghiệp FarmDiaries. Tôi chỉ có thể hỗ trợ bạn về kỹ thuật trồng trọt, chăn nuôi và chăm sóc nhật ký nông trại thôi ạ! 🌱';
      isSafetyBlocked = true;
      confidence = 1.0;
      citations = [];
    } else {
      // 6. Call LLM Service
      const start = Date.now();
      const llmResult = await this.llmService.complete({
        prompt: builtPrompt.prompt,
        promptVersion: builtPrompt.promptVersion,
        userId,
      });
      const latency = Date.now() - start;

      responseContent = llmResult.text;

      // Handle safety blocked responses
      if (responseContent === LLM_SAFETY_MESSAGE) {
        responseContent = 'Nội dung câu hỏi chứa các thuật ngữ chưa phù hợp để tư vấn nông nghiệp. Bà con vui lòng đặt câu hỏi rõ ràng hơn về kỹ thuật cây trồng nhé!';
        isSafetyBlocked = true;
      }
    }

    // 7. Apply PHI / Pesticide Warnings
    let phiWarning: string | undefined;
    let safetyAlert: string | undefined;

    const lowerResponse = responseContent.toLowerCase();
    if (PHI_KEYWORDS.some((k) => lowerResponse.includes(k))) {
      phiWarning = '⚠️ Thời gian cách ly PHI: Cần tuân thủ thời gian cách ly tối thiểu 14 ngày trước khi thu hoạch để bảo vệ người tiêu dùng.';
    }

    const matchedBanned = BANNED_PESTICIDES.filter((p) => lowerResponse.includes(p));
    if (matchedBanned.length > 0) {
      safetyAlert = `🚨 CẢNH BÁO BẢO VỆ THỰC VẬT: Hoạt chất ${matchedBanned.join(', ')} nằm trong danh mục cấm hoặc hạn chế nghiêm ngặt tại Việt Nam do độc tính cực cao đối với sức khỏe và môi trường. Vui lòng tham khảo ý kiến Chi cục Bảo vệ Thực vật địa phương để thay thế bằng hoạt chất an toàn hơn.`;
    }

    // Map confidence score from RAG similarity
    if (citations.length > 0) {
      confidence = citations[0].score;
    } else if (!isSafetyBlocked) {
      // If no citations, average query confidence is lower
      confidence = 0.58;
    }

    // 8. Save user and assistant messages to MongoDB
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    const userMessage: ChatMessageSubdocument = {
      message_id: userMsgId,
      role: 'user',
      content: dto.content,
      timestamp: new Date(),
    } as any;

    const assistantMessage: ChatMessageSubdocument = {
      message_id: assistantMsgId,
      role: 'assistant',
      content: responseContent,
      model: hasNonAgri ? null : 'gemini-1.5-flash',
      prompt_version: builtPrompt.promptVersion,
      rate_limited: responseContent === LLM_FALLBACK_MESSAGE,
      timestamp: new Date(),
      confidence,
      sources: citations.map((c) => `${c.title} (Độ tin cậy: ${Math.round(c.score * 100)}%)`),
      phi_warning: phiWarning,
      safety_alert: safetyAlert,
    } as any;

    session.messages.push(userMessage, assistantMessage);
    await session.save();

    return {
      session_id: session.session_id,
      response: {
        message_id: assistantMsgId,
        role: 'assistant',
        content: responseContent,
        timestamp: assistantMessage.timestamp.toISOString(),
        rate_limited: assistantMessage.rate_limited,
        confidence,
        sources: assistantMessage.sources,
        phi_warning: phiWarning,
        safety_alert: safetyAlert,
        mascot_mood: isSafetyBlocked ? 'sleepy' : (phiWarning || safetyAlert ? 'worried' : 'happy'),
      },
      pet_mood_updated: false,
    };
  }

  async getSessions(userId: string) {
    const sessions = await this.chatModel
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .exec();

    return sessions.map((s) => ({
      session_id: s.session_id,
      title: s.title,
      created_at: (s as any).created_at,
      updated_at: (s as any).updated_at,
    }));
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId, userId);
    return {
      session_id: session.session_id,
      messages: session.messages.map((m) => ({
        message_id: m.message_id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        confidence: m.confidence,
        sources: m.sources,
        phi_warning: m.phi_warning,
        safety_alert: m.safety_alert,
      })),
    };
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
      message: 'Cảm ơn bạn đã phản hồi để AI cải tiến tốt hơn! 🌱',
    };
  }
}
