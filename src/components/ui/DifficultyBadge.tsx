import { Circle } from 'lucide-react';

interface DifficultyBadgeProps {
  level: 'easy' | 'medium' | 'hard';
  showLabel?: boolean;
  className?: string;
}

const difficultyConfig = {
  easy: {
    color: 'text-green-400',
    fillColor: '#4ade80',
    label: 'Beginner'
  },
  medium: {
    color: 'text-yellow-400',
    fillColor: '#facc15',
    label: 'Intermediate'
  },
  hard: {
    color: 'text-red-400',
    fillColor: '#f87171',
    label: 'Advanced'
  }
};

export function DifficultyBadge({ level, showLabel = true, className = '' }: DifficultyBadgeProps) {
  const config = difficultyConfig[level];
  
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Circle 
        className={`w-3 h-3 ${config.color}`} 
        fill={config.fillColor}
        strokeWidth={0}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export default DifficultyBadge;
