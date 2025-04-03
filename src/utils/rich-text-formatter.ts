// src/utils/rich-text-formatter.ts
import { createLogger } from '../config/logger';

const logger = createLogger('RichTextFormatter');

/**
 * Utility class for formatting content to match Strapi's Lexical rich text format
 */
export class RichTextFormatter {
  /**
   * Convert plain text to Strapi Lexical rich text format
   * Uses the correct structure expected by Strapi's Lexical-based rich text editor
   * 
   * @param text Plain text to convert (can be null or undefined)
   * @returns Properly formatted Lexical JSON structure or empty array if no text
   */
  public static textToLexical(content?: string | null): any[] {
    if (!content) {
      return [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: ''
        }]
      }];
    }
    
    try {
      // Split by line breaks to create multiple paragraphs
      const paragraphs = content.split(/\r?\n\r?\n+/).filter(Boolean);
      
      if (paragraphs.length === 0) {
        // Single empty paragraph
        return [
          {
            type: 'paragraph',
            children: [{ 
              type: 'text',
              text: '' 
            }],
            format: '',
            indent: 0,
            version: 1,
            direction: null
          }
        ];
      }

      // Create a paragraph node for each paragraph with proper Lexical format
      return paragraphs.map((paragraph: string) => ({
        type: 'paragraph',
        children: [{ 
          type: 'text',
          text: paragraph.trim() 
        }],
        format: '',
        indent: 0,
        version: 1,
        direction: null
      }));
    } catch (error) {
      logger.error(`Error converting text to Lexical format: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return a safe minimal structure on error
      return [
        {
          type: 'paragraph',
          children: [{ 
            type: 'text',
            text: String(content).substring(0, 500) 
          }],
          format: '',
          indent: 0,
          version: 1,
          direction: null
        }
      ];
    }
  }

  /**
   * Check if a value is a valid Lexical rich text format
   * 
   * @param value The value to check
   * @returns Boolean indicating if the value is in valid Lexical format
   */
  public static isValidLexical(value: any): boolean {
    if (!Array.isArray(value)) {
      return false;
    }

    if (value.length === 0) {
      return true; // Empty array is valid
    }

    try {
      // Check basic structure of Lexical format
      return value.every(node => 
        node.type && 
        node.children && 
        Array.isArray(node.children) &&
        node.children.every((child: any) => 
          typeof child === 'object' && 
          (
            (child.type === 'text' && child.text !== undefined) || 
            (child.type === 'link' && child.url !== undefined)
          )
        )
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert a value to Lexical format, handling different input types
   * 
   * @param value The value to convert (string, object, or array)
   * @returns Properly formatted Lexical JSON structure
   */
  public static toLexical(value: any): any[] {
    if (!value) {
      return [];
    }

    // If it's already a valid Lexical structure, return it
    if (this.isValidLexical(value)) {
      return value;
    }

    // If it's a string, convert it
    if (typeof value === 'string') {
      return this.textToLexical(value);
    }

    // If it's something else, try to stringify it and convert
    try {
      const stringValue = typeof value === 'object' 
        ? JSON.stringify(value) 
        : String(value);
      
      return this.textToLexical(stringValue);
    } catch (error) {
      logger.error(`Error converting value to Lexical format: ${error instanceof Error ? error.message : String(error)}`);
      return [
        {
          type: 'paragraph',
          children: [{ text: '' }],
          format: '',
          indent: 0, 
          version: 1,
          direction: null
        }
      ];
    }
  }
}