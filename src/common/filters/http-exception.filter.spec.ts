import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './http-exception.filter';

const prismaError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '6.x',
  });

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockLogger: { error: jest.Mock; log: jest.Mock };
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockRequest: { method: string; url: string; ip: string };
  let mockHost: any;

  beforeEach(() => {
    mockLogger = { error: jest.fn(), log: jest.fn() };
    filter = new GlobalExceptionFilter(mockLogger as any);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = { method: 'GET', url: '/test', ip: '127.0.0.1' };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('handles HttpException with object response', () => {
    const exception = new HttpException(
      { message: 'Not found', error: 'Not Found' },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: ['Not found'],
      }),
    );
  });

  it('handles HttpException with string response', () => {
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('handles generic Error as 500', () => {
    const exception = new Error('Something went wrong');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it('handles Prisma P2002 (unique constraint) as 409 Conflict', () => {
    const exception = prismaError('P2002', 'Unique constraint');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('handles Prisma P2025 (record not found) as 404', () => {
    const exception = prismaError('P2025', 'Not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
  });

  it('handles Prisma P2003 (foreign key) as 400', () => {
    const exception = prismaError('P2003', 'FK failed');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
  });

  it('handles ForbiddenError (CSRF) as 403', () => {
    const exception = Object.create({
      constructor: { name: 'ForbiddenError' },
    });
    Object.defineProperty(exception, 'constructor', {
      value: { name: 'ForbiddenError' },
    });
    Object.setPrototypeOf(exception, Error.prototype);
    exception.message = 'CSRF error';

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
  });

  it('logs the error', () => {
    const exception = new HttpException(
      'Unauthorized',
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, mockHost);

    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('wraps non-array messages in array', () => {
    const exception = new HttpException(
      'Single message',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(Array.isArray(jsonCall.message)).toBe(true);
  });

  it('includes timestamp and path in response', () => {
    const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.timestamp).toBeDefined();
    expect(jsonCall.path).toBe('/test');
  });
});
