import { useState, useEffect } from 'react';
import { Check, CheckCircle } from 'lucide-react';

interface MarkCompleteProps {
  moduleId: string;
  moduleName: string;
}

export default function MarkComplete({ moduleId, moduleName }: MarkCompleteProps) {
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Check localStorage on mount
    const completed = localStorage.getItem(`module-complete-${moduleId}`);
    setIsComplete(completed === 'true');
  }, [moduleId]);

  const toggleComplete = () => {
    const newState = !isComplete;
    setIsComplete(newState);
    localStorage.setItem(`module-complete-${moduleId}`, String(newState));
    
    if (newState) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 600);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={toggleComplete}
        className={`
          flex items-center gap-3 px-6 py-3 rounded-xl font-semibold text-lg
          transition-all duration-300 transform
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0f0f17]
          ${isComplete 
            ? 'bg-[#00b894] text-white hover:bg-[#00a381] focus:ring-[#00b894]' 
            : 'bg-[#6c5ce7] text-white hover:bg-[#5b4cdb] focus:ring-[#6c5ce7]'
          }
          ${isAnimating ? 'scale-105' : 'scale-100'}
        `}
        aria-pressed={isComplete}
        aria-label={isComplete ? `Mark ${moduleName} as incomplete` : `Mark ${moduleName} as complete`}
      >
        {isComplete ? (
          <>
            <CheckCircle className={`w-6 h-6 ${isAnimating ? 'animate-bounce' : ''}`} />
            Completed!
          </>
        ) : (
          <>
            <Check className="w-6 h-6" />
            Mark as Complete
          </>
        )}
      </button>
      
      {isComplete && (
        <p className="text-sm text-[#00b894] animate-fade-in flex items-center gap-1">
          <Check className="w-4 h-4" /> Your progress has been saved
        </p>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
