import fs from 'fs';
import path from 'path';
import type { PresentationData } from './types';

const officeParser = require('officeparser');

class PresentationParser {
  private readonly supportedExtensions = ['.pptx', '.ppt'];

  /**
   * Check if a file is a Windows temporary file (starts with ~$)
   */
  private isTemporaryFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return fileName.startsWith('~$');
  }

  isSupportedFile(filePath: string): boolean {
    // Skip Windows temporary files
    if (this.isTemporaryFile(filePath)) {
      return false;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async parsePresentationFile(filePath: string): Promise<PresentationData> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath, path.extname(filePath));
      
      let content = '';
      
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.pptx' || ext === '.ppt') {
        content = await this.parsePowerPoint(filePath);
      }

      return {
        title: fileName,
        content: content,
        path: path.normalize(filePath), // Ensure path is properly normalized
        fileSize: stats.size
      };
    } catch (error) {
      console.error(`Error parsing presentation ${filePath}:`, error);
      return {
        title: path.basename(filePath, path.extname(filePath)),
        content: `Error parsing file: ${(error as Error).message}`,
        path: filePath,
        fileSize: 0
      };
    }
  }

  private async parsePowerPoint(filePath: string): Promise<string> {
    try {
      console.log(`Parsing PowerPoint file: ${filePath}`);
      
      // Use officeparser to extract text from PowerPoint files (.ppt/.pptx)
      const config = {
        ignoreNotes: true, // Ignore speaker notes
        newlineDelimiter: '\n', // Use newlines between text elements
        putContinuousLinesInArray: false // Keep text as string
      };

      const data = await officeParser.parseOfficeAsync(filePath, config);
      console.log(`Raw extracted data type: ${typeof data}, length: ${data?.length || 0}`);
      
      if (!data || typeof data !== 'string' || data.trim().length === 0) {
        console.warn(`No text content found in presentation: ${filePath}`);
        return 'No text content found in presentation';
      }

      // Clean up the extracted text
      const cleanedText = data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

      console.log(`Successfully extracted ${cleanedText.length} characters from ${filePath}`);
      return cleanedText || 'No text content found in presentation';
    } catch (error) {
      console.error(`Error parsing PowerPoint file ${filePath}:`, error);
      throw new Error(`Failed to parse PowerPoint file: ${(error as Error).message}`);
    }
  }

  async parseDirectory(directoryPath: string): Promise<PresentationData[]> {
    const presentations: PresentationData[] = [];
    
    try {
      const files = await this.getAllFiles(directoryPath);
      
      for (const file of files) {
        if (this.isSupportedFile(file)) {
          const presentation = await this.parsePresentationFile(file);
          presentations.push(presentation);
        }
      }
      
      return presentations;
    } catch (error) {
      console.error(`Error parsing directory ${directoryPath}:`, error);
      throw error;
    }
  }

  async getAllFiles(dirPath: string, arrayOfFiles: string[] = []): Promise<string[]> {
    try {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            arrayOfFiles = await this.getAllFiles(fullPath, arrayOfFiles);
          } else {
            arrayOfFiles.push(fullPath);
          }
        } catch (err) {
          // Skip files that can't be accessed
          console.warn(`Skipping file ${fullPath}: ${(err as Error).message}`);
          continue;
        }
      }

      return arrayOfFiles;
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      throw error;
    }
  }

  extractTitleFromContent(content: string): string {
    if (!content) return 'Untitled Presentation';
    
    const lines = content.split('\n');
    const firstLine = lines[0].trim();
    
    // If first line is short enough, use it as title
    if (firstLine.length > 0 && firstLine.length <= 100) {
      return firstLine;
    }
    
    // Otherwise, take first 50 characters
    return content.substring(0, 50).trim() + (content.length > 50 ? '...' : '');
  }
}

export default new PresentationParser();
