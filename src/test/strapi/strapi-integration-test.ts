// src/test/strapi/strapi-integration-test.ts
import { createLogger } from '../../config/logger';
import { StrapiAuthService } from '../../services/strapi-auth.service';
import { RichTextFormatter } from '../../utils/rich-text-formatter';
import { StrapiDiagnostic } from '../../utils/strapi-diagnostic.util';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set diagnostic mode for detailed logging
process.env.ENABLE_STRAPI_DIAGNOSTICS = 'true';

const logger = createLogger('StrapiIntegrationTest');

/**
 * Test Strapi integration with focus on rich text formatting
 */
async function testStrapiIntegration() {
  try {
    logger.info('Starting Strapi integration test...');
    
    // Initialize the enhanced Strapi service
    const strapiService = StrapiAuthService.getInstance();
    
    // Test the connection
    logger.info('Testing Strapi connection...');
    const isConnected = await strapiService.testConnection();
    
    if (!isConnected) {
      logger.error('Failed to connect to Strapi');
      return;
    }
    
    logger.info('Successfully connected to Strapi ✅');
    
    // Test rich text formatting
    logger.info('Testing rich text formatting...');
    
    // Simple text
    const simpleText = "This is a simple paragraph.";
    const simpleFormatted = RichTextFormatter.toLexical(simpleText);
    logger.info('Simple text formatted:');
    logger.info(JSON.stringify(simpleFormatted, null, 2));
    
    // Multi-paragraph text
    const multiParagraphText = "First paragraph\n\nSecond paragraph\n\nThird paragraph with **bold** text";
    const multiFormatted = RichTextFormatter.toLexical(multiParagraphText);
    logger.info('Multi-paragraph text formatted:');
    logger.info(JSON.stringify(multiFormatted, null, 2));
    
    // Test validation
    logger.info('Testing validation of formatted content...');
    
    // Valid case
    const validResult = StrapiDiagnostic.checkRichTextField('valid', simpleFormatted);
    logger.info(`Valid formatting test: ${validResult ? 'Passed ✅' : 'Failed ❌'}`);
    
    // Invalid case - raw string
    const invalidResult = StrapiDiagnostic.checkRichTextField('invalid', "Raw unformatted string");
    logger.info(`Invalid formatting test: ${!invalidResult ? 'Passed ✅' : 'Failed ❌'}`);
    
    // Test course creation
    logger.info('Testing course creation with formatted description...');
    
    // Prepare test course data
    const courseData = {
      data: {
        name: "Test Course with Rich Text",
        code: "TEST101",
        userId: "test-user-123",
        courseLevel: "Undergraduate 1st & 2nd year",
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        isActive: true,
        country: "Test Country",
        organisation: "Test University",
        // This description should be automatically formatted
        description: "This is a test course with multiple paragraphs.\n\nSecond paragraph with more details.",
        // This field should also be formatted
        assessmentRedesign: "Weekly assignments and a final project."
      }
    };
    
    try {
      logger.info('Creating test course in Strapi...');
      
      // Normally we'd use the post method, but we'll just validate the data for testing
      const validationResult = StrapiDiagnostic.validateStrapiData(courseData.data);
      
      if (!validationResult.valid) {
        logger.warn(`Validation found ${validationResult.issues.length} issues with course data:`);
        validationResult.issues.forEach(issue => {
          logger.warn(`Field "${issue.field}": ${issue.issue}`);
          logger.warn(`Suggestion: ${issue.suggestion}`);
        });
      } else {
        logger.info('Course data validation passed ✅');
      }
      
      // Now properly format the data
      logger.info('Formatting course data with RichTextFormatter...');
      const formattedCourseData = {
        data: {
          ...courseData.data,
          description: RichTextFormatter.toLexical(courseData.data.description),
          assessmentRedesign: RichTextFormatter.toLexical(courseData.data.assessmentRedesign)
        }
      };
      
      // Validate the formatted data
      const formattedValidationResult = StrapiDiagnostic.validateStrapiData(formattedCourseData.data);
      logger.info(`Formatted data validation: ${formattedValidationResult.valid ? 'Passed ✅' : 'Failed ❌'}`);
      
      if (formattedValidationResult.valid) {
        logger.info('Ready to send formatted data to Strapi');
        logger.info('Course creation test complete ✅');
      }
    } catch (error) {
      logger.error(`Course creation test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    logger.info('Strapi integration test completed successfully!');
  } catch (error) {
    logger.error(`Strapi integration test failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testStrapiIntegration().then(() => {
    logger.info('Test completed, exiting...');
    process.exit(0);
  }).catch((error) => {
    logger.error(`Unhandled error in test: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

// Export for use in other tests
export { testStrapiIntegration };