// src/utils/strapi-diagnostic.util.ts
import { createLogger } from '../config/logger';
import fs from 'fs';
import path from 'path';
import { ServiceConfig } from '../config/service-config';
import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';

const logger = createLogger('StrapiDiagnostic');
const lookupAsync = promisify(dns.lookup);

/**
 * Utility class for diagnosing Strapi integration issues
 * Provides tools for logging, validating, and troubleshooting Strapi API interactions
 */
export class StrapiDiagnostic {
  private static diagDir = path.join(process.cwd(), 'logs', 'strapi-diag');
  
  /**
   * Initialize the diagnostic directory
   */
  private static initDiagDir(): void {
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(path.join(process.cwd(), 'logs'))) {
        fs.mkdirSync(path.join(process.cwd(), 'logs'));
      }
      
      // Create strapi-diag directory if it doesn't exist
      if (!fs.existsSync(this.diagDir)) {
        fs.mkdirSync(this.diagDir);
      }
    } catch (error) {
      logger.error(`Failed to initialize diagnostic directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Log a request to Strapi for diagnostic purposes
   * 
   * @param endpoint The Strapi endpoint being called
   * @param method The HTTP method being used
   * @param data The data being sent to Strapi
   * @param extraInfo Additional information to log
   */
  public static logStrapiRequest(
    endpoint: string,
    method: string,
    data: any,
    extraInfo: Record<string, any> = {}
  ): void {
    this.initDiagDir();
    
    try {
      // Create a unique filename based on timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `${timestamp}_${method}_${endpoint.replace(/\//g, '_')}.json`;
      const filePath = path.join(this.diagDir, filename);
      
      // Prepare the diagnostic data
      const diagData = {
        timestamp: new Date().toISOString(),
        endpoint,
        method,
        data,
        ...extraInfo
      };
      
      // Write the data to a file
      fs.writeFileSync(filePath, JSON.stringify(diagData, null, 2));
      
      logger.info(`Diagnostic data logged to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to log diagnostic data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Log a Strapi error response for diagnostic purposes
   * 
   * @param endpoint The Strapi endpoint that was called
   * @param method The HTTP method that was used
   * @param error The error response from Strapi
   * @param requestData The data that was sent to Strapi
   */
  public static logStrapiError(
    endpoint: string,
    method: string,
    error: any,
    requestData: any
  ): void {
    this.initDiagDir();
    
    try {
      // Extract error details
      const status = error.response?.status || 'unknown';
      const errorData = error.response?.data || {};
      const errorMessage = error.message || 'Unknown error';
      
      // Create a unique filename based on timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `${timestamp}_ERROR_${status}_${method}_${endpoint.replace(/\//g, '_')}.json`;
      const filePath = path.join(this.diagDir, filename);
      
      // Prepare the diagnostic data
      const diagData = {
        timestamp: new Date().toISOString(),
        endpoint,
        method,
        requestData,
        error: {
          message: errorMessage,
          status,
          data: errorData
        }
      };
      
      // Write the data to a file
      fs.writeFileSync(filePath, JSON.stringify(diagData, null, 2));
      
      logger.info(`Error diagnostic data logged to ${filePath}`);
      
      // Provide helpful information in the logs
      this.analyzeError(errorData, requestData);
    } catch (diagError) {
      logger.error(`Failed to log error diagnostic data: ${diagError instanceof Error ? diagError.message : String(diagError)}`);
    }
  }
  
  /**
   * Analyze a Strapi error response and provide helpful information
   * 
   * @param errorData The error data from Strapi
   * @param requestData The request data that was sent to Strapi
   */
  private static analyzeError(errorData: any, requestData: any): void {
    try {
      // Check for validation errors
      if (errorData.error?.name === 'ValidationError') {
        logger.warn('Strapi validation error detected. Analyzing...');
        
        const errors = errorData.error?.details?.errors || [];
        if (errors.length > 0) {
          logger.warn(`Found ${errors.length} validation errors:`);
          
          errors.forEach((err: any, index: number) => {
            logger.warn(`Error ${index + 1}:`);
            logger.warn(`  Path: ${JSON.stringify(err.path)}`);
            logger.warn(`  Message: ${err.message}`);
            logger.warn(`  Value: ${JSON.stringify(err.value)}`);
            
            // Provide helpful suggestion based on the error
            this.suggestFixForError(err, requestData);
          });
        }
      }
    } catch (error) {
      logger.error(`Error analyzing Strapi error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Suggest a fix for a specific validation error
   * 
   * @param error The validation error
   * @param requestData The request data that was sent to Strapi
   */
  private static suggestFixForError(error: any, requestData: any): void {
    try {
      const path = error.path;
      const message = error.message;
      
      // Check for common error patterns
      if (message.includes('must be Text or Link')) {
        logger.warn(`  Suggestion: The field at path ${JSON.stringify(path)} must contain a simple text node or link, not complex markup.`);
        logger.warn(`  Fix: Ensure you're using RichTextFormatter.toLexical() on this field.`);
      } else if (message.includes('required')) {
        logger.warn(`  Suggestion: The field at path ${JSON.stringify(path)} is required but missing.`);
      } else if (message.includes('must be a valid datetime')) {
        logger.warn(`  Suggestion: The field at path ${JSON.stringify(path)} must be a valid ISO date string (YYYY-MM-DD).`);
      }
    } catch (error) {
      logger.error(`Error suggesting fix: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate data against Strapi Lexical format requirements
   * 
   * @param data The data to validate
   * @returns Object containing validation results and suggestions
   */
  public static validateStrapiData(data: any): {
    valid: boolean;
    issues: Array<{
      field: string;
      issue: string;
      suggestion: string;
    }>;
  } {
    const issues: Array<{ field: string; issue: string; suggestion: string }> = [];
    
    try {
      // Check for rich text fields
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'string' && value.includes('\n')) {
          issues.push({
            field: key,
            issue: 'Potential rich text field with newlines that needs formatting',
            suggestion: `Format using RichTextFormatter.toLexical(${key})`
          });
        }
        
        if (Array.isArray(value) && value.some(item => item.type === 'paragraph')) {
          // Check if each paragraph has properly formatted children
          const badNodes = value.filter(node => 
            node.type === 'paragraph' && 
            (!node.children || !Array.isArray(node.children) || 
             node.children.some((child: any) => !child.text && child.type !== 'link'))
          );
          
          if (badNodes.length > 0) {
            issues.push({
              field: key,
              issue: `${badNodes.length} paragraph nodes have improperly formatted children`,
              suggestion: 'Ensure children contain only text or link nodes'
            });
          }
        }
      });
    } catch (error) {
      logger.error(`Error validating Strapi data: ${error instanceof Error ? error.message : String(error)}`);
      issues.push({
        field: 'general',
        issue: 'Error during validation',
        suggestion: 'Check the logs for more details'
      });
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Check a rich text field for common formatting issues
   * 
   * @param fieldName The name of the field
   * @param fieldValue The value of the field
   * @returns Boolean indicating if the field is properly formatted
   */
  public static checkRichTextField(fieldName: string, fieldValue: any): boolean {
    try {
      // If the field is undefined or null, it's fine (unless it's required elsewhere)
      if (fieldValue === undefined || fieldValue === null) {
        return true;
      }
      
      // If it's a string, it needs to be formatted
      if (typeof fieldValue === 'string') {
        logger.warn(`Field "${fieldName}" is a string but should be formatted as Lexical rich text`);
        return false;
      }
      
      // If it's an array, check that it's properly formatted
      if (Array.isArray(fieldValue)) {
        // Empty array is valid
        if (fieldValue.length === 0) {
          return true;
        }
        
        // Check each node
        const invalidNodes = fieldValue.filter(node => {
          // Each node must have a type and children
          if (!node.type || !node.children || !Array.isArray(node.children)) {
            return true;
          }
          
          // Each child must have text or be a link
          return node.children.some((child: any) => 
            !(child.type === 'text' && typeof child.text === 'string') && 
            !(child.type === 'link' && typeof child.url === 'string')
          );
        });
        
        if (invalidNodes.length > 0) {
          logger.warn(`Field "${fieldName}" has ${invalidNodes.length} invalid Lexical nodes`);
          return false;
        }
        
        return true;
      }
      
      // Any other type is invalid
      logger.warn(`Field "${fieldName}" has unexpected type: ${typeof fieldValue}`);
      return false;
    } catch (error) {
      logger.error(`Error checking rich text field "${fieldName}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Run a comprehensive diagnostic check on the Strapi connection
   * 
   * @returns Diagnostic results object
   */
  public static async runConnectionDiagnostic(): Promise<any> {
    const diagResults: any = {
      timestamp: new Date().toISOString(),
      config: {},
      connectivity: {},
      recommendations: []
    };
    
    try {
      // Get Strapi configuration
      const strapiConfig = ServiceConfig.getStrapiConfig();
      
      // Basic configuration check
      diagResults.config = {
        enabled: strapiConfig.enabled,
        baseUrl: strapiConfig.baseUrl,
        hasApiToken: !!strapiConfig.apiToken,
        hasCredentials: !!(strapiConfig.username && strapiConfig.password),
        authMethod: strapiConfig.apiToken ? 'API Token' : (strapiConfig.username && strapiConfig.password ? 'Username/Password' : 'None')
      };
      
      // Parse the base URL to get components
      const parsedUrl = new URL(strapiConfig.baseUrl);
      const hostname = parsedUrl.hostname;
      const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
      
      // Check if Strapi is enabled
      if (!strapiConfig.enabled) {
        diagResults.recommendations.push('Strapi integration is disabled in the configuration. Set ENABLE_STRAPI=true in your environment variables.');
      }
      
      // DNS lookup test
      try {
        diagResults.connectivity.dns = { status: 'pending' };
        const dnsResult = await lookupAsync(hostname);
        diagResults.connectivity.dns = {
          status: 'success',
          ip: dnsResult.address,
          family: `IPv${dnsResult.family}`
        };
      } catch (dnsError) {
        diagResults.connectivity.dns = {
          status: 'failed',
          error: dnsError instanceof Error ? dnsError.message : String(dnsError)
        };
        diagResults.recommendations.push(`DNS resolution failed for ${hostname}. Check if the hostname is correct and resolvable.`);
      }
      
      // TCP connection test
      if (diagResults.connectivity.dns?.status === 'success') {
        diagResults.connectivity.tcp = { status: 'pending' };
        try {
          // Use a simple axios request with a short timeout just to test connectivity
          await axios.get(`${parsedUrl.protocol}//${hostname}:${port}`, {
            timeout: 2000,
            validateStatus: () => true // Accept any status code as success for this test
          });
          
          diagResults.connectivity.tcp = {
            status: 'success',
            host: hostname,
            port: port
          };
        } catch (tcpError: any) {
          const errorCode = tcpError.code || '';
          diagResults.connectivity.tcp = {
            status: 'failed',
            error: tcpError instanceof Error ? tcpError.message : String(tcpError),
            code: errorCode
          };
          
          if (errorCode === 'ECONNREFUSED') {
            diagResults.recommendations.push(`Connection to ${hostname}:${port} was refused. Make sure Strapi is running and the port is correct.`);
          } else if (errorCode === 'ETIMEDOUT') {
            diagResults.recommendations.push(`Connection to ${hostname}:${port} timed out. Check network connectivity and firewall settings.`);
          }
        }
      }
      
      // API connection test (simple health check)
      if (diagResults.connectivity.tcp?.status === 'success') {
        diagResults.connectivity.api = { status: 'pending' };
        try {
          // Try a simple request to the API root
          const healthCheckUrl = `${strapiConfig.baseUrl}/api`;
          const response = await axios.get(healthCheckUrl, {
            timeout: 5000,
            validateStatus: () => true // Accept any status code for diagnostics
          });
          
          diagResults.connectivity.api = {
            status: response.status >= 200 && response.status < 500 ? 'success' : 'failed',
            statusCode: response.status,
            contentType: response.headers['content-type']
          };
          
          if (response.status === 404) {
            diagResults.recommendations.push('Received 404 from Strapi API. This is expected for the root endpoint but indicates the server is responding.');
          } else if (response.status >= 500) {
            diagResults.recommendations.push('Strapi server is responding but returned a server error. Check Strapi logs for issues.');
          }
        } catch (apiError) {
          diagResults.connectivity.api = {
            status: 'failed',
            error: apiError instanceof Error ? apiError.message : String(apiError)
          };
          diagResults.recommendations.push('Failed to connect to the Strapi API endpoint. The server may be down or unreachable.');
        }
      }
      
      // Auth test (if API connection succeeded)
      if (diagResults.connectivity.api?.status === 'success') {
        diagResults.connectivity.auth = { status: 'pending' };
        try {
          let authTestUrl = `${strapiConfig.baseUrl}/api/users/me`;
          let headers: Record<string, string> = {};
          
          // Add authentication headers based on configuration
          if (strapiConfig.apiToken) {
            headers['Authorization'] = `Bearer ${strapiConfig.apiToken}`;
          } else if (strapiConfig.username && strapiConfig.password) {
            // For JWT auth, we'd normally need to get a token first, but we'll skip that complexity here
            diagResults.connectivity.auth = {
              status: 'skipped',
              reason: 'JWT authentication requires a separate login step'
            };
            diagResults.recommendations.push('Using username/password authentication. Consider switching to API token for simplified integration.');
            return diagResults;
          } else {
            diagResults.connectivity.auth = {
              status: 'skipped',
              reason: 'No authentication credentials provided'
            };
            diagResults.recommendations.push('No authentication credentials found. Configure STRAPI_API_TOKEN or STRAPI_USERNAME and STRAPI_PASSWORD.');
            return diagResults;
          }
          
          // Make authenticated request
          const response = await axios.get(authTestUrl, {
            headers,
            timeout: 5000,
            validateStatus: () => true // Accept any status code for diagnostics
          });
          
          diagResults.connectivity.auth = {
            status: response.status === 200 ? 'success' : 'failed',
            statusCode: response.status
          };
          
          if (response.status === 401) {
            diagResults.recommendations.push('Authentication failed with 401 Unauthorized. Check if the API token or credentials are correct and have the necessary permissions.');
          } else if (response.status === 403) {
            diagResults.recommendations.push('Authentication failed with 403 Forbidden. The provided credentials don\'t have permission to access the requested resource.');
          }
        } catch (authError) {
          diagResults.connectivity.auth = {
            status: 'failed',
            error: authError instanceof Error ? authError.message : String(authError)
          };
          diagResults.recommendations.push('Failed to authenticate with Strapi. Check your authentication credentials and network connectivity.');
        }
      }
      
      // Overall status
      if (diagResults.connectivity.auth?.status === 'success') {
        diagResults.status = 'success';
        diagResults.message = 'Strapi connection is healthy';
      } else if (diagResults.connectivity.api?.status === 'success') {
        diagResults.status = 'partial';
        diagResults.message = 'Strapi server is reachable but authentication failed';
      } else if (diagResults.connectivity.tcp?.status === 'success') {
        diagResults.status = 'partial';
        diagResults.message = 'Strapi server port is open but API is not responding correctly';
      } else if (diagResults.connectivity.dns?.status === 'success') {
        diagResults.status = 'failed';
        diagResults.message = 'Strapi server hostname resolves but server is not reachable';
      } else {
        diagResults.status = 'failed';
        diagResults.message = 'Cannot connect to Strapi server';
      }
      
      // Connection refused check
      if (diagResults.connectivity.tcp?.status === 'failed' && 
          diagResults.connectivity.tcp?.error?.includes('ECONNREFUSED')) {
        diagResults.recommendations.push(
          'Connection was refused. Verify that Strapi is running and accessible on the configured URL. ' +
          'Check network configuration and ensure the Strapi server is running on the expected port.'
        );
      }
      
      // Log the diagnostic results
      logger.info(`Strapi connection diagnostic completed with status: ${diagResults.status}`);
      if (diagResults.recommendations.length > 0) {
        logger.info(`Recommendations: ${diagResults.recommendations.length}`);
        diagResults.recommendations.forEach((rec: string, index: number) => {
          logger.info(`  ${index + 1}. ${rec}`);
        });
      }
      
      // Save diagnostic result to file
      this.saveDiagnosticResult(diagResults);
      
      return diagResults;
    } catch (error) {
      logger.error(`Error in Strapi diagnostic: ${error instanceof Error ? error.message : String(error)}`);
      
      diagResults.status = 'error';
      diagResults.message = 'Diagnostic failed to complete';
      diagResults.error = error instanceof Error ? error.message : String(error);
      
      return diagResults;
    }
  }
  
  /**
   * Save diagnostic results to a file
   */
  private static saveDiagnosticResult(diagResults: any): void {
    this.initDiagDir();
    
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `${timestamp}_connection_diagnostic.json`;
      const filePath = path.join(this.diagDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(diagResults, null, 2));
      logger.info(`Diagnostic results saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save diagnostic results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}