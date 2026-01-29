import { useEffect, useRef } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

// Simple syntax highlighting for JavaScript/TypeScript
function highlightJS(code: string): string {
  // Keywords
  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|new|typeof|instanceof|import|export|from|default|async|await|try|catch|throw|this)\b/g;
  
  // Strings
  const strings = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;
  
  // Numbers
  const numbers = /\b(\d+\.?\d*)\b/g;
  
  // Comments
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  
  // Function calls
  const functions = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  
  // Properties/methods after dot
  const properties = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  
  // Apply highlighting (order matters!)
  let highlighted = code
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Comments (green)
    .replace(comments, '<span class="text-[#6a9955]">$1</span>')
    // Strings (orange)
    .replace(strings, '<span class="text-[#ce9178]">$&</span>')
    // Numbers (light green)
    .replace(numbers, '<span class="text-[#b5cea8]">$1</span>')
    // Keywords (purple)
    .replace(keywords, '<span class="text-[#c586c0]">$1</span>')
    // Functions (yellow)
    .replace(functions, '<span class="text-[#dcdcaa]">$1</span>(')
    // Properties (cyan)
    .replace(properties, '.<span class="text-[#9cdcfe]">$1</span>');
  
  return highlighted;
}

export default function CodeBlock({ code, language = 'javascript' }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && language === 'javascript') {
      codeRef.current.innerHTML = highlightJS(code);
    }
  }, [code, language]);

  return (
    <div className="my-6 bg-[#1e1e2e] rounded-xl overflow-hidden border border-[#2a2a3a]">
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0f] border-b border-[#2a2a3a]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#e17055]" />
          <div className="w-3 h-3 rounded-full bg-[#fdcb6e]" />
          <div className="w-3 h-3 rounded-full bg-[#00b894]" />
        </div>
        <span className="text-xs text-[#6a6a7a] ml-2">{language}</span>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code 
          ref={codeRef}
          className="font-mono text-[#d4d4d4]"
        >
          {code}
        </code>
      </pre>
    </div>
  );
}
