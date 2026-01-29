import { useState, useEffect, useCallback, useRef } from 'react';
import { Target, Trophy, Dumbbell, ThumbsUp, PartyPopper, Check, X, Lightbulb } from 'lucide-react';

// Question types
interface MultipleChoiceQuestion {
  type: 'multiple-choice';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface CodeCompletionQuestion {
  type: 'code-completion';
  question: string;
  codeTemplate: string;  // Use ___ for blanks
  answers: string[];     // Correct answers for each blank
  explanation: string;
}

type QuizQuestion = MultipleChoiceQuestion | CodeCompletionQuestion;

interface QuizProps {
  title: string;
  questions: QuizQuestion[];
  onComplete?: (score: number, total: number) => void;
}

// Confetti particle
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

// Confetti component
function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Create particles
    const colors = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#74b9ff', '#fd79a8'];
    particlesRef.current = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: (Math.random() - 0.5) * 10,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 10 + 5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      // Remove off-screen particles
      particlesRef.current = particlesRef.current.filter(
        (p) => p.y < canvas.height + 50
      );

      if (particlesRef.current.length > 0) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
    />
  );
}

// Progress bar component
function ProgressBar({ current, total }: { current: number; total: number }) {
  const percentage = ((current) / total) * 100;
  
  return (
    <div className="mb-6">
      <div className="flex justify-between text-sm text-[#a0a0b0] mb-2">
        <span>Question {current + 1} of {total}</span>
        <span>{Math.round(percentage)}% complete</span>
      </div>
      <div className="h-2 bg-[#1a1a24] rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Multiple choice question component
function MultipleChoice({
  question,
  onAnswer,
  disabled,
  selectedIndex,
  showResult,
}: {
  question: MultipleChoiceQuestion;
  onAnswer: (index: number) => void;
  disabled: boolean;
  selectedIndex: number | null;
  showResult: boolean;
}) {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (key >= '1' && key <= '4') {
        const index = parseInt(key) - 1;
        if (index < question.options.length) {
          onAnswer(index);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, question.options.length, onAnswer]);

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-white mb-6">{question.question}</h3>
      
      <div className="grid gap-3">
        {question.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCorrect = index === question.correctIndex;
          
          let buttonClass = 'w-full text-left p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-4 group';
          
          if (showResult) {
            if (isCorrect) {
              buttonClass += ' bg-[#00b894]/20 border-[#00b894] text-[#00b894]';
            } else if (isSelected && !isCorrect) {
              buttonClass += ' bg-[#e17055]/20 border-[#e17055] text-[#e17055]';
            } else {
              buttonClass += ' bg-[#1a1a24] border-[#2a2a3a] text-[#6a6a7a]';
            }
          } else if (isSelected) {
            buttonClass += ' bg-[#6c5ce7]/20 border-[#6c5ce7] text-white';
          } else {
            buttonClass += ' bg-[#12121a] border-[#2a2a3a] text-[#a0a0b0] hover:border-[#6c5ce7] hover:bg-[#1a1a24]';
          }

          return (
            <button
              key={index}
              onClick={() => onAnswer(index)}
              disabled={disabled}
              className={buttonClass}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                showResult && isCorrect
                  ? 'bg-[#00b894] text-white'
                  : showResult && isSelected && !isCorrect
                  ? 'bg-[#e17055] text-white'
                  : isSelected
                  ? 'bg-[#6c5ce7] text-white'
                  : 'bg-[#2a2a3a] text-[#6a6a7a] group-hover:bg-[#3a3a4a]'
              }`}>
                {index + 1}
              </span>
              <span className="flex-1">{option}</span>
              {showResult && isCorrect && (
                <Check className="w-6 h-6" />
              )}
              {showResult && isSelected && !isCorrect && (
                <X className="w-6 h-6" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Code completion question component
function CodeCompletion({
  question,
  onAnswer,
  disabled,
  userAnswers,
  showResult,
}: {
  question: CodeCompletionQuestion;
  onAnswer: (answers: string[]) => void;
  disabled: boolean;
  userAnswers: string[];
  showResult: boolean;
}) {
  const [inputs, setInputs] = useState<string[]>(
    userAnswers.length > 0 ? userAnswers : question.answers.map(() => '')
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Parse code template to identify blanks
  const parts = question.codeTemplate.split('___');
  const blankCount = parts.length - 1;

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
  };

  const handleSubmit = () => {
    onAnswer(inputs);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      if (index < blankCount - 1) {
        inputRefs.current[index + 1]?.focus();
      } else {
        handleSubmit();
      }
    } else if (e.key === 'Tab' && !e.shiftKey && index < blankCount - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const isCorrect = (index: number) => {
    return inputs[index]?.trim().toLowerCase() === question.answers[index]?.toLowerCase();
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-4">{question.question}</h3>
      
      <div className="bg-[#0a0a0f] rounded-xl p-6 font-mono text-sm overflow-x-auto border border-[#2a2a3a]">
        <pre className="whitespace-pre-wrap">
          {parts.map((part, index) => (
            <span key={index}>
              <span className="text-[#a0a0b0]">{part}</span>
              {index < blankCount && (
                <span className="inline-block mx-1">
                  <input
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    value={inputs[index] || ''}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    disabled={disabled}
                    placeholder="..."
                    className={`w-20 px-2 py-1 rounded border text-center font-mono transition-all ${
                      showResult
                        ? isCorrect(index)
                          ? 'bg-[#00b894]/20 border-[#00b894] text-[#00b894]'
                          : 'bg-[#e17055]/20 border-[#e17055] text-[#e17055]'
                        : 'bg-[#1a1a24] border-[#3a3a4a] text-white focus:border-[#6c5ce7] focus:outline-none'
                    }`}
                  />
                  {showResult && !isCorrect(index) && (
                    <span className="text-[#00b894] ml-2">({question.answers[index]})</span>
                  )}
                </span>
              )}
            </span>
          ))}
        </pre>
      </div>

      {!disabled && !showResult && (
        <button
          onClick={handleSubmit}
          className="px-6 py-3 bg-[#6c5ce7] text-white rounded-xl font-semibold hover:bg-[#5b4cdb] transition-colors"
        >
          Check Answer
        </button>
      )}
    </div>
  );
}

// Feedback component
function Feedback({
  isCorrect,
  explanation,
  onContinue,
}: {
  isCorrect: boolean;
  explanation: string;
  onContinue: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        onContinue();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onContinue]);

  return (
    <div
      className={`mt-6 p-5 rounded-xl border-2 animate-fade-in ${
        isCorrect
          ? 'bg-[#00b894]/10 border-[#00b894]'
          : 'bg-[#e17055]/10 border-[#e17055]'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isCorrect ? 'bg-[#00b894]' : 'bg-[#e17055]'
          }`}
        >
          {isCorrect ? <Check className="w-5 h-5 text-white" /> : <X className="w-5 h-5 text-white" />}
        </div>
        <div className="flex-1">
          <h4
            className={`font-bold text-lg mb-2 ${
              isCorrect ? 'text-[#00b894]' : 'text-[#e17055]'
            }`}
          >
            {isCorrect ? 'Correct!' : 'Not quite!'}
          </h4>
          <p className="text-[#a0a0b0] mb-4">{explanation}</p>
          <button
            onClick={onContinue}
            className="px-5 py-2 bg-[#2a2a3a] text-white rounded-lg hover:bg-[#3a3a4a] transition-colors flex items-center gap-2"
          >
            Continue <span className="text-[#6a6a7a]">(Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Summary component
function Summary({
  score,
  total,
  onRestart,
}: {
  score: number;
  total: number;
  onRestart: () => void;
}) {
  const percentage = Math.round((score / total) * 100);
  
  let message = '';
  let EmojiIcon = Dumbbell;
  
  if (percentage === 100) {
    message = 'Perfect score! You\'ve mastered this topic!';
    EmojiIcon = Trophy;
  } else if (percentage >= 80) {
    message = 'Great job! You really understand this material!';
    EmojiIcon = PartyPopper;
  } else if (percentage >= 60) {
    message = 'Good effort! Review the concepts you missed.';
    EmojiIcon = ThumbsUp;
  } else {
    message = 'Keep practicing! Review the lesson and try again.';
    EmojiIcon = Dumbbell;
  }

  return (
    <div className="text-center py-8 animate-fade-in">
      <div className="mb-4 flex justify-center">
        <EmojiIcon className="w-16 h-16 text-accent" />
      </div>
      <h3 className="text-3xl font-bold text-white mb-4">Quiz Complete!</h3>
      
      <div className="inline-flex items-center gap-4 bg-[#1a1a24] rounded-2xl px-8 py-6 mb-6">
        <div className="text-5xl font-bold text-[#6c5ce7]">{score}</div>
        <div className="text-[#4a4a5a] text-3xl">/</div>
        <div className="text-5xl font-bold text-[#4a4a5a]">{total}</div>
      </div>
      
      <div className="mb-8">
        <div className="h-4 bg-[#1a1a24] rounded-full overflow-hidden max-w-md mx-auto">
          <div
            className={`h-full transition-all duration-1000 ease-out ${
              percentage >= 80
                ? 'bg-gradient-to-r from-[#00b894] to-[#55efc4]'
                : percentage >= 60
                ? 'bg-gradient-to-r from-[#fdcb6e] to-[#ffeaa7]'
                : 'bg-gradient-to-r from-[#e17055] to-[#fab1a0]'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-[#a0a0b0] mt-4">{message}</p>
      </div>
      
      <button
        onClick={onRestart}
        className="px-8 py-4 bg-[#6c5ce7] text-white rounded-xl font-semibold text-lg hover:bg-[#5b4cdb] transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}

// Main Quiz component
export default function Quiz({ title, questions, onComplete }: QuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | string[])[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const currentQuestion = questions[currentIndex];

  const checkAnswer = useCallback((answer: number | string[]) => {
    const question = questions[currentIndex];
    let isCorrect = false;

    if (question.type === 'multiple-choice' && typeof answer === 'number') {
      isCorrect = answer === question.correctIndex;
    } else if (question.type === 'code-completion' && Array.isArray(answer)) {
      isCorrect = answer.every(
        (a, i) => a.trim().toLowerCase() === question.answers[i]?.toLowerCase()
      );
    }

    if (isCorrect) {
      setScore((s) => s + 1);
    }

    setAnswers((prev) => [...prev, answer]);
    setShowResult(true);

    return isCorrect;
  }, [currentIndex, questions]);

  const handleMultipleChoiceAnswer = useCallback((index: number) => {
    if (showResult) return;
    checkAnswer(index);
  }, [showResult, checkAnswer]);

  const handleCodeCompletionAnswer = useCallback((inputs: string[]) => {
    if (showResult) return;
    checkAnswer(inputs);
  }, [showResult, checkAnswer]);

  const handleContinue = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowResult(false);
    } else {
      setIsComplete(true);
      const finalScore = score + (showResult ? 0 : 0); // score already updated
      if (finalScore === questions.length) {
        setShowConfetti(true);
      }
      onComplete?.(score, questions.length);
    }
  }, [currentIndex, questions.length, score, showResult, onComplete]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setAnswers([]);
    setShowResult(false);
    setScore(0);
    setIsComplete(false);
    setShowConfetti(false);
  }, []);

  const getCurrentAnswer = () => {
    return answers[currentIndex];
  };

  const isCurrentAnswerCorrect = () => {
    const answer = getCurrentAnswer();
    const question = currentQuestion;

    if (!answer || !question) return false;

    if (question.type === 'multiple-choice' && typeof answer === 'number') {
      return answer === question.correctIndex;
    } else if (question.type === 'code-completion' && Array.isArray(answer)) {
      return answer.every(
        (a, i) => a.trim().toLowerCase() === question.answers[i]?.toLowerCase()
      );
    }

    return false;
  };

  return (
    <div className="bg-[#12121a] rounded-2xl border border-[#2a2a3a] overflow-hidden">
      <Confetti active={showConfetti} />
      
      {/* Header */}
      <div className="bg-[#0a0a0f] px-6 py-4 border-b border-[#2a2a3a]">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-accent" />
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6">
        {isComplete ? (
          <Summary score={score} total={questions.length} onRestart={handleRestart} />
        ) : (
          <>
            <ProgressBar current={currentIndex} total={questions.length} />
            
            <div className="min-h-[300px]">
              {currentQuestion.type === 'multiple-choice' ? (
                <MultipleChoice
                  question={currentQuestion}
                  onAnswer={handleMultipleChoiceAnswer}
                  disabled={showResult}
                  selectedIndex={typeof getCurrentAnswer() === 'number' ? getCurrentAnswer() as number : null}
                  showResult={showResult}
                />
              ) : (
                <CodeCompletion
                  question={currentQuestion}
                  onAnswer={handleCodeCompletionAnswer}
                  disabled={showResult}
                  userAnswers={Array.isArray(getCurrentAnswer()) ? getCurrentAnswer() as string[] : []}
                  showResult={showResult}
                />
              )}
              
              {showResult && (
                <Feedback
                  isCorrect={isCurrentAnswerCorrect()}
                  explanation={currentQuestion.explanation}
                  onContinue={handleContinue}
                />
              )}
            </div>
          </>
        )}
      </div>
      
      {/* Footer hint */}
      {!isComplete && !showResult && (
        <div className="px-6 py-3 bg-[#0a0a0f] border-t border-[#2a2a3a]">
          <p className="text-[#4a4a5a] text-sm text-center flex items-center justify-center gap-2">
            <Lightbulb className="w-4 h-4" /> Tip: Use number keys (1-4) to select answers, Enter to continue
          </p>
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// Export types for use in other files
export type { QuizQuestion, MultipleChoiceQuestion, CodeCompletionQuestion };
