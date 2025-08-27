import React from 'react';
import { FileLink } from '../components/FileLink';

interface ParsedContent {
  type: 'text' | 'file-link';
  content: string;
  href?: string;
  linkText?: string;
}

/**
 * Parse markdown content and extract file:// links for special rendering
 */
function parseMarkdownContent(content: string): ParsedContent[] {
  const parts: ParsedContent[] = [];
  const fileUrlRegex = /\[([^\]]+)\]\((file:\/\/\/[^\)]+)\)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = fileUrlRegex.exec(content)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.substring(lastIndex, match.index)
      });
    }
    
    // Add the file link
    parts.push({
      type: 'file-link',
      content: match[0], // Full match for fallback
      href: match[2],
      linkText: match[1]
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.substring(lastIndex)
    });
  }
  
  return parts;
}

interface RenderMarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Render markdown content with enhanced file link styling
 */
export function RenderMarkdownContent({ content, className = '' }: RenderMarkdownContentProps) {
  const parts = parseMarkdownContent(content);
  
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, index) => {
        if (part.type === 'file-link' && part.href && part.linkText) {
          return (
            <FileLink 
              key={index} 
              href={part.href} 
            >
              {part.linkText}
            </FileLink>
          );
        }
        return <span key={index}>{part.content}</span>;
      })}
    </div>
  );
}
