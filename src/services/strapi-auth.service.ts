// src/services/strapi-auth.service.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createLogger } from '../config/logger';
import { RetryUtility } from '../utils/retry.util';

const logger = createLogger('StrapiAuthService');

/**
 * Service for handling Strapi authentication and API requests
 * Implements best practices for secure API communication with Strapi
 */
export class StrapiAuthService {
  private static instance: StrapiAuthService;
  private strapiClient: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly strapiBaseUrl: string;
  private readonly strapiApiToken: string;
  private readonly strapiUsername: string;
  private readonly strapiPassword: string;
  private readonly useApiToken: boolean;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Get configuration from environment variables
    this.strapiBaseUrl = process.env.STRAPI_BASE_URL || 'http://localhost:1337';
    this.strapiApiToken = process.env.STRAPI_API_TOKEN || '';
    this.strapiUsername = process.env.STRAPI_USERNAME || '';
    this.strapiPassword = process.env.STRAPI_PASSWORD || '';
    
    // Determine authentication method based on available credentials
    this.useApiToken = !!this.strapiApiToken;

    // Create Axios instance with base configuration
    this.strapiClient = axios.create({
      baseURL: this.strapiBaseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 seconds timeout
    });
    
    // Add request interceptor to handle authentication
    this.setupRequestInterceptor();
    
    // Add response interceptor for error handling
    this.setupResponseInterceptor();
    
    logger.info(`StrapiAuthService initialized with baseURL: ${this.strapiBaseUrl}`);
    logger.info(`Authentication method: ${this.useApiToken ? 'API Token' : 'Username/Password'}`);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): StrapiAuthService {
    if (!StrapiAuthService.instance) {
      StrapiAuthService.instance = new StrapiAuthService();
    }
    return StrapiAuthService.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  public static reset(): void {
    StrapiAuthService.instance = undefined as any;
  }

  /**
   * Set up request interceptor to add authentication headers
   */
  private setupRequestInterceptor(): void {
    this.strapiClient.interceptors.request.use(
      async (config) => {
        // If using API token authentication
        if (this.useApiToken) {
          config.headers['Authorization'] = `Bearer ${this.strapiApiToken}`;
          return config;
        }
        
        // Otherwise, use JWT authentication
        // Check if token is valid or needs to be refreshed
        if (!this.authToken || this.isTokenExpired()) {
          try {
            await this.authenticate();
          } catch (error) {
            logger.error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
          }
        }
        
        // Add the JWT token
        if (this.authToken) {
          config.headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        return config;
      },
      (error) => {
        logger.error(`Request interceptor error: ${error.message}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set up response interceptor for error handling
   */
  private setupResponseInterceptor(): void {
    this.strapiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          
          // Handle authentication errors
          if (status === 401 || status === 403) {
            logger.error(`Authentication error: ${status} - ${JSON.stringify(data)}`);
            
            // If using JWT, invalidate token to force re-authentication on next request
            if (!this.useApiToken && this.authToken) {
              this.authToken = null;
              this.tokenExpiry = null;
            }
          } else {
            logger.error(`Strapi API error: ${status} - ${JSON.stringify(data)}`);
          }
        } else if (error.request) {
          logger.error(`No response received: ${error.message}`);
        } else {
          logger.error(`Request setup error: ${error.message}`);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if the JWT token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    
    // Add a 5-minute buffer to ensure we refresh before expiration
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return new Date().getTime() > (this.tokenExpiry.getTime() - bufferTime);
  }

  /**
   * Authenticate with Strapi using username/password
   */
  private async authenticate(): Promise<void> {
    if (this.useApiToken) {
      // If using API token, no need to authenticate
      return;
    }
    
    if (!this.strapiUsername || !this.strapiPassword) {
      throw new Error('Strapi username and password are required for JWT authentication');
    }
    
    try {
      const response = await axios.post(`${this.strapiBaseUrl}/api/auth/local`, {
        identifier: this.strapiUsername,
        password: this.strapiPassword
      });
      
      if (response.data && response.data.jwt) {
        this.authToken = response.data.jwt;
        
        // Set token expiry (Strapi tokens typically last 30 days)
        // We'll set it to 25 days to be safe
        const expiryDays = 25;
        this.tokenExpiry = new Date();
        this.tokenExpiry.setDate(this.tokenExpiry.getDate() + expiryDays);
        
        logger.info('Successfully authenticated with Strapi');
      } else {
        throw new Error('Received invalid authentication response from Strapi');
      }
    } catch (error) {
      logger.error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Make a GET request to Strapi API with retry capability
   * @param endpoint The API endpoint (without /api prefix)
   * @param params Query parameters
   * @param config Additional Axios config
   * @returns The response data
   */
  public async get<T = any>(
    endpoint: string, 
    params: any = {}, 
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    return RetryUtility.withRetry(async () => {
      const fullEndpoint = this.ensureApiPrefix(endpoint);
      const response = await this.strapiClient.get(fullEndpoint, {
        ...config,
        params
      });
      return response.data;
    }, {
      maxRetries: 3,
      initialDelay: 1000,
      factor: 2
    });
  }

  /**
   * Make a POST request to Strapi API with retry capability
   * @param endpoint The API endpoint (without /api prefix)
   * @param data The data to post
   * @param config Additional Axios config
   * @returns The response data
   */
  public async post<T = any>(
    endpoint: string, 
    data: any = {}, 
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    return RetryUtility.withRetry(async () => {
      const fullEndpoint = this.ensureApiPrefix(endpoint);
      const response = await this.strapiClient.post(fullEndpoint, data, config);
      return response.data;
    }, {
      maxRetries: 3,
      initialDelay: 1000,
      factor: 2
    });
  }

  /**
   * Make a PUT request to Strapi API with retry capability
   * @param endpoint The API endpoint (without /api prefix)
   * @param data The data to update
   * @param config Additional Axios config
   * @returns The response data
   */
  public async put<T = any>(
    endpoint: string, 
    data: any = {}, 
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    return RetryUtility.withRetry(async () => {
      const fullEndpoint = this.ensureApiPrefix(endpoint);
      const response = await this.strapiClient.put(fullEndpoint, data, config);
      return response.data;
    }, {
      maxRetries: 3,
      initialDelay: 1000,
      factor: 2
    });
  }

  /**
   * Make a DELETE request to Strapi API with retry capability
   * @param endpoint The API endpoint (without /api prefix)
   * @param config Additional Axios config
   * @returns The response data
   */
  public async delete<T = any>(
    endpoint: string, 
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    return RetryUtility.withRetry(async () => {
      const fullEndpoint = this.ensureApiPrefix(endpoint);
      const response = await this.strapiClient.delete(fullEndpoint, config);
      return response.data;
    }, {
      maxRetries: 3,
      initialDelay: 1000,
      factor: 2
    });
  }

  /**
   * Test the connection to Strapi
   * @returns True if connection is successful
   */
  public async testConnection(): Promise<boolean> {
    try {
      // Try to get a basic endpoint that doesn't require special permissions
      const response = await this.get('/users/me');
      return !!response;
    } catch (error) {
      logger.error(`Strapi connection test failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Ensure API endpoint has the /api prefix
   * @param endpoint The API endpoint
   * @returns The endpoint with /api prefix
   */
  private ensureApiPrefix(endpoint: string): string {
    if (endpoint.startsWith('/api/')) {
      return endpoint;
    }
    
    // Add leading slash if missing
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `/api${normalizedEndpoint}`;
  }
}