import fs from 'fs';
import path from 'path';
import type { PresentationData } from './types';

const pptxTextParser = require('pptx-text-parser');

interface PPTXTextResult {
  slides: Array<{
    shapes: Array<{
      text?: string;
    }>;
  }>;
}

class PresentationParser {
  private readonly supportedExtensions = ['.pptx', '.ppt'];

  isSupportedFile(filePath: string): boolean {
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
      
      if (path.extname(filePath).toLowerCase() === '.pptx') {
        content = await this.parsePPTX(filePath);
      } else if (path.extname(filePath).toLowerCase() === '.ppt') {
        // For .ppt files, we'll need a different approach or conversion
        content = `Legacy PowerPoint file - content extraction not yet implemented for ${fileName}`;
      }

      return {
        title: fileName,
        content: content,
        path: filePath,
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

  private async parsePPTX(filePath: string): Promise<string> {
    try {
      const textJSON: PPTXTextResult = await pptxTextParser(filePath, 'json');
      
      if (!textJSON || !textJSON.slides || textJSON.slides.length === 0) {
        return 'No text content found in presentation';
      }

      // Extract text from each slide and join with delimiter
      const content = textJSON.slides
        .map(slide => {
          // Extract text from slide shapes
          const slideText = slide.shapes
            .map(shape => shape.text || '')
            .join(' ')
            .trim();
          return slideText;
        })
        .filter(slideText => slideText.length > 0)
        .join('\n----\n');

      return content || 'No text content found in presentation';
    } catch (error) {
      console.error(`Error parsing PPTX file ${filePath}:`, error);
      throw new Error(`Failed to parse PPTX: ${(error as Error).message}`);
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