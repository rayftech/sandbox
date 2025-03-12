// src/test/userSync/test_auth_middleware.ts
import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { User, IUser } from '../../models/user.model';
import { UserService } from '../../services/user.service';
import { AuthMiddleware } from '../../middlewares/auth.middleware';
import { ApiError } from '../../middlewares/error.middleware';

// Mock UserService
jest.mock('../../services/user.service', () => {
  const originalModule = jest.requireActual('../../services/user.service');
  return {
    ...originalModule,
    UserService: {
      ...originalModule.UserService,
      getUserById: jest.fn(),
    },
  };
});

describe('Authentication Middleware Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock<NextFunction>;
  
  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Clear the database before each test
    await User.deleteMany({});
    
    // Setup mock request, response, and next function
    mockRequest = {
      headers: {},
      params: {},
      body: {}
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    nextFunction = jest.fn();
  });
  
  afterAll(async () => {
    await mongoose.disconnect();
  });
  
  describe('authenticateUser middleware', () => {
    it('should extract userId from headers and attach user to request when valid', async () => {
      // Arrange
      const testUserId = 'test-user-123';
      const mockUser: Partial<IUser> = {
        userId: testUserId,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'academic',
        isAdmin: false
      };
      
      mockRequest.headers = { 'x-user-id': testUserId };
      
      // Mock UserService to return the test user
      (UserService.getUserById as jest.Mock).mockResolvedValue(mockUser);
      
      // Act
      await AuthMiddleware.authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(UserService.getUserById).toHaveBeenCalledWith(testUserId);
      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalledWith();
      expect(nextFunction).not.toHaveBeenCalledWith(expect.any(ApiError));
    });
    
    it('should extract userId from params and attach user to request when valid', async () => {
      // Arrange
      const testUserId = 'test-user-123';
      const mockUser: Partial<IUser> = {
        userId: testUserId,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'academic',
        isAdmin: false
      };
      
      mockRequest.params = { userId: testUserId };
      
      // Mock UserService to return the test user
      (UserService.getUserById as jest.Mock).mockResolvedValue(mockUser);
      
      // Act
      await AuthMiddleware.authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(UserService.getUserById).toHaveBeenCalledWith(testUserId);
      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalledWith();
    });
    
    it('should extract userId from body and attach user to request when valid', async () => {
      // Arrange
      const testUserId = 'test-user-123';
      const mockUser: Partial<IUser> = {
        userId: testUserId,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'academic',
        isAdmin: false
      };
      
      mockRequest.body = { userId: testUserId };
      
      // Mock UserService to return the test user
      (UserService.getUserById as jest.Mock).mockResolvedValue(mockUser);
      
      // Act
      await AuthMiddleware.authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(UserService.getUserById).toHaveBeenCalledWith(testUserId);
      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalledWith();
    });
    
    it('should call next with 401 error when no userId is provided', async () => {
      // Arrange - empty request, no userId
      
      // Act
      await AuthMiddleware.authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(UserService.getUserById).not.toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authentication required');
    });
    
    it('should call next with 401 error when user is not found', async () => {
      // Arrange
      const testUserId = 'non-existent-user';
      mockRequest.headers = { 'x-user-id': testUserId };
      
      // Mock UserService to return null (user not found)
      (UserService.getUserById as jest.Mock).mockResolvedValue(null);
      
      // Act
      await AuthMiddleware.authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(UserService.getUserById).toHaveBeenCalledWith(testUserId);
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Invalid user authentication');
    });
    
    it('should call next with 500 error when a database error occurs', async () => {
      // Arrange
      const testUserId = 'test-user-123';
      mockRequest.headers = { 'x-user-id': testUserId };
      
      // Mock UserService to throw an error
      const dbError = new Error('Database connection failed');
      (UserService.getUserById as jest.Mock).mockRejectedValue(dbError);
      
      // Act
      await AuthMiddleware.authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(UserService.getUserById).toHaveBeenCalledWith(testUserId);
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(500);
      expect(error.message).toContain('Authentication error');
    });
  });
  
  describe('requireAdmin middleware', () => {
    it('should call next() when user is an admin', () => {
      // Arrange
      const adminUser: Partial<IUser> = {
        userId: 'admin-user',
        email: 'admin@example.com',
        isAdmin: true
      };
      
      mockRequest.user = adminUser as IUser;
      
      // Act
      AuthMiddleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(nextFunction).toHaveBeenCalledWith();
      expect(nextFunction).not.toHaveBeenCalledWith(expect.any(ApiError));
    });
    
    it('should call next with 403 error when user is not an admin', () => {
      // Arrange
      const regularUser: Partial<IUser> = {
        userId: 'regular-user',
        email: 'user@example.com',
        isAdmin: false
      };
      
      mockRequest.user = regularUser as IUser;
      
      // Act
      AuthMiddleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Admin access required');
    });
    
    it('should call next with 401 error when user is not authenticated', () => {
      // Arrange - request with no user
      
      // Act
      AuthMiddleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authentication required');
    });
  });
  
  describe('requireUserType middleware', () => {
    it('should call next() when user has an allowed type', () => {
      // Arrange
      const academicUser: Partial<IUser> = {
        userId: 'academic-user',
        email: 'academic@example.com',
        userType: 'academic',
        isAdmin: false
      };
      
      mockRequest.user = academicUser as IUser;
      const allowedTypes = ['academic', 'admin'];
      
      // Create the middleware function with allowed types
      const middleware = AuthMiddleware.requireUserType(allowedTypes);
      
      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(nextFunction).toHaveBeenCalledWith();
      expect(nextFunction).not.toHaveBeenCalledWith(expect.any(ApiError));
    });
    
    it('should call next with 403 error when user does not have an allowed type', () => {
      // Arrange
      const industryUser: Partial<IUser> = {
        userId: 'industry-user',
        email: 'industry@example.com',
        userType: 'industry',
        isAdmin: false
      };
      
      mockRequest.user = industryUser as IUser;
      const allowedTypes = ['academic', 'admin'];
      
      // Create the middleware function with allowed types
      const middleware = AuthMiddleware.requireUserType(allowedTypes);
      
      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Access restricted to');
    });
    
    it('should call next with 401 error when user is not authenticated', () => {
      // Arrange - request with no user
      const allowedTypes = ['academic', 'admin'];
      
      // Create the middleware function with allowed types
      const middleware = AuthMiddleware.requireUserType(allowedTypes);
      
      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );
      
      // Assert
      expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
      const error = nextFunction.mock.calls[0][0] as ApiError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authentication required');
    });
  });
});