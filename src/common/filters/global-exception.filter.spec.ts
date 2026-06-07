/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { GlobalExceptionFilter } from './global-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

// Mock Sentry SDK
jest.mock('@sentry/nestjs');

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockArgumentsHost: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    };
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should catch HttpException and format structured JSON response (no Sentry capture for < 500)', () => {
    const exception = new HttpException(
      'Bad Request Message',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'BAD_REQUEST',
        message: 'Bad Request Message',
        timestamp: expect.any(String),
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should catch 500 Server Error, call Sentry.captureException, and format structured JSON response', () => {
    const exception = new HttpException(
      'Internal Server Error Message',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: 'Internal Server Error Message',
        timestamp: expect.any(String),
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });

  it('should catch non-HttpException, default to 500 status, call Sentry.captureException, and format response', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: 'Database connection failed',
        timestamp: expect.any(String),
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });

  it('should format message from array response in validation errors', () => {
    const validationResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      message: [
        'email must be an email',
        'password must be longer than 6 characters',
      ],
      error: 'Bad Request',
    };
    const exception = new HttpException(
      validationResponse,
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'Bad Request',
        message:
          'email must be an email, password must be longer than 6 characters',
        timestamp: expect.any(String),
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
