import { Sandpack, SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview } from '@codesandbox/sandpack-react';
import { atomDark } from '@codesandbox/sandpack-themes';
import type { SandpackPredefinedTemplate } from '@codesandbox/sandpack-react';

interface CodePlaygroundProps {
  code: string;
  template?: SandpackPredefinedTemplate;
  showPreview?: boolean;
  editorHeight?: string;
  title?: string;
}

export default function CodePlayground({ 
  code, 
  template = 'vanilla',
  showPreview = true,
  editorHeight = '400px',
  title
}: CodePlaygroundProps) {
  // Custom dark theme matching our arcade style
  const arcadeTheme = {
    ...atomDark,
    colors: {
      ...atomDark.colors,
      surface1: '#0a0a0f',
      surface2: '#12121a',
      surface3: '#1a1a24',
      accent: '#6c5ce7',
    },
    font: {
      ...atomDark.font,
      body: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: '"Fira Code", "JetBrains Mono", monospace',
      size: '14px',
    },
  };

  return (
    <div className="my-8 rounded-xl overflow-hidden border border-[#2a2a3a]">
      {title && (
        <div className="bg-[#12121a] px-4 py-2 border-b border-[#2a2a3a]">
          <span className="text-sm font-medium text-[#a0a0b0]">{title}</span>
        </div>
      )}
      <Sandpack
        template={template}
        theme={arcadeTheme}
        files={{
          '/index.js': code.trim(),
        }}
        options={{
          showNavigator: false,
          showTabs: false,
          showLineNumbers: true,
          showInlineErrors: true,
          wrapContent: true,
          editorHeight,
          autorun: true,
        }}
        customSetup={{
          entry: '/index.js',
        }}
      />
    </div>
  );
}

// Simpler version for inline code editing
export function InlineEditor({ 
  code, 
  language = 'javascript',
  height = '200px' 
}: { 
  code: string; 
  language?: string;
  height?: string;
}) {
  return (
    <div className="my-6 rounded-xl overflow-hidden border border-[#2a2a3a]">
      <SandpackProvider
        template="vanilla"
        theme={atomDark}
        files={{
          '/index.js': code.trim(),
        }}
      >
        <SandpackLayout>
          <SandpackCodeEditor 
            showLineNumbers 
            style={{ height }} 
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
