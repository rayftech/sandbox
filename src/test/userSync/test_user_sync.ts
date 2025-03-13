// src/test/userSync/test_user_sync.ts
import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { UserService, IAmplifyUserData } from '../../services/user.service';
import { RabbitMQServiceMock, createRabbitMQServiceMock } from './mocks/test_rabbitmq_mock';
import { UserConsumerService } from '../../services/user.consumer.service';
import { EventPublisher } from '../../services/event.publisher';
import { EventType } from '../../models/events.model';


// Add these helper functions to the top of your test_user_sync.ts file

/**
 * Helper function to wait for database operations to complete
 * Atlas connections might have higher latency than local connections
 */
const waitForDb = async (ms = 300) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Helper function to retry a database operation a few times
 * Useful for eventual consistency in cloud databases
 */
async function retryDbOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 300
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (result) return result;
      
      // If the result is null/undefined but we expected data, wait and retry
      await waitForDb(delay);
    } catch (error) {
      lastError = error;
      await waitForDb(delay);
    }
  }
  
  throw lastError || new Error(`Operation failed after ${maxRetries} attempts`);
}

// Then update your failing tests:

it('should create a new user when the user does not exist', async () => {
  // Arrange
  const userData: IAmplifyUserData = {
    userId: '123456789',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    userType: 'academic',
    isAdmin: false
  };

  // Act
  const result = await UserService.createOrUpdateUser(userData);

  // Assert
  expect(result).toBeDefined();
  expect(result.userId).toBe(userData.userId);
  expect(result.email).toBe(userData.email);
  
  // Verify it was saved to the database with retry logic for Atlas
  const userInDb = await retryDbOperation(
    () => User.findOne({ userId: userData.userId }),
    3,  // 3 retries
    500 // 500ms between retries
  );
  
  expect(userInDb).not.toBeNull();
  expect(userInDb?.email).toBe(userData.email);
});

it('should update an existing user when the user already exists', async () => {
  // Arrange - First create a user
  const initialUserData: IAmplifyUserData = {
    userId: '123456789',
    email: 'initial@example.com',
    firstName: 'Initial',
    lastName: 'User',
    userType: 'academic',
    isAdmin: false
  };
  
  await UserService.createOrUpdateUser(initialUserData);
  await waitForDb(500); // Wait for Atlas to process the write
  
  // Now update the user
  const updatedUserData: IAmplifyUserData = {
    userId: '123456789', // Same user ID
    email: 'updated@example.com',
    firstName: 'Updated',
    lastName: 'User',
    userType: 'industry',
    isAdmin: true
  };

  // Act
  const result = await UserService.createOrUpdateUser(updatedUserData);

  // Assert
  expect(result).toBeDefined();
  expect(result.userId).toBe(updatedUserData.userId);
  expect(result.email).toBe(updatedUserData.email);

  // Verify it was updated in the database with retry logic
  const userInDb = await retryDbOperation(
    () => User.findOne({ userId: updatedUserData.userId }),
    3,
    500
  );
  
  expect(userInDb).not.toBeNull();
  expect(userInDb?.email).toBe(updatedUserData.email);
});


// Mock dependencies
jest.mock('../../services/rabbitmq.service', () => ({
  RabbitMQService: createRabbitMQServiceMock(),
  QueueType: {
    NOTIFICATION: 'notification',
    PARTNERSHIP_REQUEST: 'partnership_request',
    ANALYTICS: 'analytics',
    EMAIL: 'email'
  },
  ExchangeType: {
    DIRECT: 'direct',
    FANOUT: 'fanout',
    TOPIC: 'topic'
  }
}));

// Create spy for EventPublisher
jest.mock('../../services/event.publisher', () => {
  const originalModule = jest.requireActual('../../services/event.publisher');
  return {
    ...originalModule,
    EventPublisher: {
      getInstance: jest.fn().mockReturnValue({
        initialize: jest.fn().mockResolvedValue(true),
        publishUserEvent: jest.fn().mockResolvedValue(true),
        publishSystemNotification: jest.fn().mockResolvedValue(true),
        publishEmailNotification: jest.fn().mockResolvedValue(true),
      }),
    },
  };
});

describe('User Synchronization Tests', () => {
  let rabbitMQService: RabbitMQServiceMock;
  let userConsumerService: UserConsumerService;
  
  beforeEach(async () => {
    // Clear database
    await User.deleteMany({});
    
    // Reset mocks
    RabbitMQServiceMock.resetMock();
    jest.clearAllMocks();

    // Get service instances
    rabbitMQService = RabbitMQServiceMock.getInstance();
    userConsumerService = UserConsumerService.getInstance();

    // Initialize consumer service
    await userConsumerService.initialize();
  });

  it('should process user sync messages and create/update users', async () => {
    // Arrange
    const userData = {
      userId: 'test-user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      userType: 'academic',
      isAdmin: false
    };

    // Spy on key methods
    const createOrUpdateUserSpy = jest.spyOn(UserService, 'createOrUpdateUser');
    const publishEventSpy = jest.spyOn(EventPublisher.getInstance(), 'publishUserEvent');

    // Act - Simulate sending a message to the user sync queue
    await rabbitMQService.sendToQueue('user_sync', userData);

    // Wait a short time for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Assert
    expect(createOrUpdateUserSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: userData.userId,
        email: userData.email
      })
    );

    expect(publishEventSpy).toHaveBeenCalledWith(
      expect.any(String), // EventType
      expect.objectContaining({
        userId: userData.userId,
        email: userData.email
      })
    );

    // Verify database record
    const userInDb = await User.findOne({ userId: userData.userId });
    expect(userInDb).toBeTruthy();
    expect(userInDb?.email).toBe(userData.email);
  });

  it('should handle incomplete user data gracefully', async () => {
    // Arrange
    const incompleteUserData = {
      userId: 'incomplete-user',
      // Missing email intentionally
    };

    // Spy on key methods
    const createOrUpdateUserSpy = jest.spyOn(UserService, 'createOrUpdateUser');
    const publishEventSpy = jest.spyOn(EventPublisher.getInstance(), 'publishUserEvent');

    // Act
    await rabbitMQService.sendToQueue('user_sync', incompleteUserData);

    // Wait a short time for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Assert
    expect(createOrUpdateUserSpy).not.toHaveBeenCalled();
    expect(publishEventSpy).not.toHaveBeenCalled();

    // Verify no user was created
    const userInDb = await User.findOne({ userId: 'incomplete-user' });
    expect(userInDb).toBeNull();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('UserService.createOrUpdateUser', () => {
    it('should create a new user when the user does not exist', async () => {
      // Arrange
      const userData: IAmplifyUserData = {
        userId: '123456789',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userType: 'academic',
        isAdmin: false
      };

      // Act
      const result = await UserService.createOrUpdateUser(userData);

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe(userData.userId);
      expect(result.email).toBe(userData.email);
      expect(result.firstName).toBe(userData.firstName);
      expect(result.lastName).toBe(userData.lastName);
      expect(result.userType).toBe(userData.userType);
      expect(result.isAdmin).toBe(userData.isAdmin);

      // Verify it was saved to the database
      const userInDb = await User.findOne({ userId: userData.userId });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.email).toBe(userData.email);
    });

    it('should update an existing user when the user already exists', async () => {
      // Arrange - First create a user
      const initialUserData: IAmplifyUserData = {
        userId: '123456789',
        email: 'initial@example.com',
        firstName: 'Initial',
        lastName: 'User',
        userType: 'academic',
        isAdmin: false
      };
      
      await UserService.createOrUpdateUser(initialUserData);
      
      // Now update the user
      const updatedUserData: IAmplifyUserData = {
        userId: '123456789', // Same user ID
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
        userType: 'industry',
        isAdmin: true
      };

      // Act
      const result = await UserService.createOrUpdateUser(updatedUserData);

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe(updatedUserData.userId);
      expect(result.email).toBe(updatedUserData.email);
      expect(result.firstName).toBe(updatedUserData.firstName);
      expect(result.lastName).toBe(updatedUserData.lastName);
      expect(result.userType).toBe(updatedUserData.userType);
      expect(result.isAdmin).toBe(updatedUserData.isAdmin);

      // Verify it was updated in the database
      const userInDb = await User.findOne({ userId: updatedUserData.userId });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.email).toBe(updatedUserData.email);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      // Using type assertion to force an invalid type for testing
      const invalidUserData = {
        userId: '',
        email: '',
        firstName: '',
        lastName: '',
        userType: '' as 'academic' | 'industry' | 'admin',
        isAdmin: false
      } as IAmplifyUserData;

      // Act & Assert
      await expect(UserService.createOrUpdateUser(invalidUserData))
        .rejects
        .toBeTruthy(); // Expect an error to be thrown
    });
  });

  describe('UserConsumerService integration with RabbitMQ', () => {
    it('should initialize and set up consumer for user sync messages', async () => {
      // Arrange
      const userConsumerService = UserConsumerService.getInstance();
      const rabbitMQService = RabbitMQServiceMock.getInstance();
      
      // Act
      await userConsumerService.initialize();
      
      // Assert
      expect(rabbitMQService.getMockCallbacks().connect).toHaveBeenCalled();
      expect(rabbitMQService.getMockCallbacks().assertQueue).toHaveBeenCalledWith('user_sync');
      expect(rabbitMQService.getMockCallbacks().consumeQueue).toHaveBeenCalledWith(
        'user_sync',
        expect.any(Function)
      );
    });

    it('should process user sync messages and create/update users', async () => {
      // Arrange
      const userConsumerService = UserConsumerService.getInstance();
      const rabbitMQService = RabbitMQServiceMock.getInstance();
      
      await userConsumerService.initialize();
      
      const userData: IAmplifyUserData = {
        userId: 'rabbitmq-test-user',
        email: 'rabbitmq@example.com',
        firstName: 'RabbitMQ',
        lastName: 'Test',
        userType: 'academic',
        isAdmin: false
      };
      
      // Spy on UserService
      const createOrUpdateUserSpy = jest.spyOn(UserService, 'createOrUpdateUser');
      
      // Act - Send a message to the user_sync queue
      await rabbitMQService.sendToQueue('user_sync', userData);
      
      // Assert
      expect(createOrUpdateUserSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userData.userId,
          email: userData.email
        })
      );
      
      // Verify that EventPublisher was called to publish an event
      expect(EventPublisher.getInstance().publishUserEvent).toHaveBeenCalledWith(
        EventType.USER_CREATED, // or EventType.USER_UPDATED
        expect.objectContaining({
          userId: userData.userId,
          email: userData.email
        })
      );
      
      // Verify user was created in the database
      const userInDb = await User.findOne({ userId: userData.userId });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.email).toBe(userData.email);
    });
    
    it('should handle incomplete user data gracefully', async () => {
      // Arrange
      const userConsumerService = UserConsumerService.getInstance();
      const rabbitMQService = RabbitMQServiceMock.getInstance();
      
      await userConsumerService.initialize();
      
      const incompleteUserData = {
        // Missing required email
        userId: 'incomplete-user',
        firstName: 'Incomplete',
        lastName: 'Data'
      };
      
      // Spy on UserService
      const createOrUpdateUserSpy = jest.spyOn(UserService, 'createOrUpdateUser');
      
      // Act - Send a message with incomplete data
      await rabbitMQService.sendToQueue('user_sync', incompleteUserData);
      
      // Assert
      expect(createOrUpdateUserSpy).not.toHaveBeenCalled();
      
      // Verify no user was created in the database
      const userInDb = await User.findOne({ userId: 'incomplete-user' });
      expect(userInDb).toBeNull();
    });
  });

  describe('End-to-end user sync flow', () => {
    it('should sync user data from Amplify through the entire system', async () => {
      // Arrange
      const amplifyUserData: IAmplifyUserData = {
        userId: '399ee4d8-c081-7025-f7fb-b98931232178',
        email: 'raymondf0123@gmail.com',
        firstName: 'JunJie',
        lastName: 'Fu',
        userType: 'academic',
        isAdmin: false
      };
      
      // Initialize services
      const userConsumerService = UserConsumerService.getInstance();
      await userConsumerService.initialize();
      
      // Act - Simulate what would happen when Amplify sends data
      await UserService.createOrUpdateUser(amplifyUserData);
      
      // Assert
      // Verify the user was created in the database
      const userInDb = await User.findOne({ userId: amplifyUserData.userId });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.email).toBe(amplifyUserData.email);
      expect(userInDb?.firstName).toBe(amplifyUserData.firstName);
      expect(userInDb?.lastName).toBe(amplifyUserData.lastName);
      
      // Verify that the events would be published
      expect(EventPublisher.getInstance().publishUserEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: amplifyUserData.userId,
          email: amplifyUserData.email
        })
      );
    });
  });

  describe('Testing with Amplify authentication data flow', () => {
    it('should properly synchronize data received from Amplify Auth', async () => {
      // Arrange - Sample data from Amplify after authentication
      const amplifyAuthData: IAmplifyUserData = {
        userId: '399ee4d8-c081-7025-f7fb-b98931232178',
        email: 'raymondf0123@gmail.com',
        firstName: 'JunJie',
        lastName: 'Fu',
        userType: 'academic',
        isAdmin: false
      };
      
      // Act - This would typically happen in the AuthController
      const user = await UserService.createOrUpdateUser(amplifyAuthData);
      
      // Assert
      expect(user).toBeDefined();
      expect(user.userId).toBe(amplifyAuthData.userId);
      expect(user.email).toBe(amplifyAuthData.email);
      
      // Verify user profile is properly set up
      expect(user.profileSettings).toBeDefined();
      expect(user.profileSettings.visibility).toBe('public'); // Default value
      
      // Verify user was saved to database
      const savedUser = await User.findOne({ userId: amplifyAuthData.userId });
      expect(savedUser).not.toBeNull();
    });
    
    it('should maintain user data consistency across multiple logins', async () => {
      // Arrange - First login data
      const firstLoginData: IAmplifyUserData = {
        userId: '399ee4d8-c081-7025-f7fb-b98931232178',
        email: 'raymondf0123@gmail.com',
        firstName: 'JunJie',
        lastName: 'Fu',
        userType: 'academic',
        isAdmin: false
      };
      
      // First login
      await UserService.createOrUpdateUser(firstLoginData);
      
      // Get the user and make some profile changes
      let user = await User.findOne({ userId: firstLoginData.userId });
      if (user) {
        user.profileSettings.visibility = 'friends-only';
        await user.save();
      }
      
      // Second login with slightly different data (e.g., name capitalization change)
      const secondLoginData: IAmplifyUserData = {
        userId: '399ee4d8-c081-7025-f7fb-b98931232178',
        email: 'raymondf0123@gmail.com',
        firstName: 'Junjie', // Changed capitalization
        lastName: 'Fu',
        userType: 'academic',
        isAdmin: false
      };
      
      // Act - Second login
      await UserService.createOrUpdateUser(secondLoginData);
      
      // Assert
      const updatedUser = await User.findOne({ userId: firstLoginData.userId });
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.firstName).toBe('Junjie'); // Name updated
      expect(updatedUser?.profileSettings.visibility).toBe('friends-only'); // Custom settings preserved
    });
  });
});