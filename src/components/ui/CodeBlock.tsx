import { useMemo } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

// Simple syntax highlighting for JavaScript/TypeScript
function highlightJS(code: string): string {
  // Escape HTML first
  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Store strings temporarily to avoid highlighting inside them
  const stringPlaceholders: string[] = [];
  escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, (match) => {
    stringPlaceholders.push(`<span class="text-[#ce9178]">${match}</span>`);
    return `__STRING_${stringPlaceholders.length - 1}__`;
  });
  
  // Store comments temporarily
  const commentPlaceholders: string[] = [];
  escaped = escaped.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, (match) => {
    commentPlaceholders.push(`<span class="text-[#6a9955]">${match}</span>`);
    return `__COMMENT_${commentPlaceholders.length - 1}__`;
  });
  
  // Keywords (purple)
  escaped = escaped.replace(
    /\b(const|let|var|function|return|if|else|for|while|class|new|typeof|instanceof|import|export|from|default|async|await|try|catch|throw|this|true|false|null|undefined)\b/g,
    '<span class="text-[#c586c0]">$1</span>'
  );
  
  // Numbers (light green) - be careful not to match inside words
  escaped = escaped.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="text-[#b5cea8]">$1</span>'
  );
  
  // Function names before parentheses (yellow)
  escaped = escaped.replace(
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
    '<span class="text-[#dcdcaa]">$1</span>('
  );
  
  // Properties/methods after dot (cyan)
  escaped = escaped.replace(
    /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    '.<span class="text-[#9cdcfe]">$1</span>'
  );
  
  // Restore comments
  commentPlaceholders.forEach((placeholder, i) => {
    escaped = escaped.replace(`__COMMENT_${i}__`, placeholder);
  });
  
  // Restore strings
  stringPlaceholders.forEach((placeholder, i) => {
    escaped = escaped.replace(`__STRING_${i}__`, placeholder);
  });
  
  return escaped;
}

export default function CodeBlock({ code, language = 'javascript' }: CodeBlockProps) {
  const highlightedCode = useMemo(() => {
    if (language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts') {
      return highlightJS(code);
    }
    // For other languages, just escape HTML
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
          className="font-mono text-[#d4d4d4]"
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
}
