import {
  Gamepad2,
  Rocket,
  MapPin,
  Wind,
  Target,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  BookOpen,
  Trophy,
  Star,
  Mouse,
  Ruler,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  Zap,
  MoveRight,
  type LucideIcon
} from 'lucide-react';

export const icons = {
  gamepad: Gamepad2,
  rocket: Rocket,
  mapPin: MapPin,
  wind: Wind,
  target: Target,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  check: Check,
  checkCircle: CheckCircle,
  bookOpen: BookOpen,
  trophy: Trophy,
  star: Star,
  mouse: Mouse,
  ruler: Ruler,
  refresh: RefreshCw,
  lightbulb: Lightbulb,
  warning: AlertTriangle,
  zap: Zap,
  moveRight: MoveRight,
} as const;

export type IconName = keyof typeof icons;

interface IconProps {
  name: IconName;
  className?: string;
  size?: number;
}

export function Icon({ name, className = 'w-5 h-5', size }: IconProps) {
  const IconComponent = icons[name];
  return <IconComponent className={className} size={size} />;
}

// Re-export all icons for direct use
export {
  Gamepad2,
  Rocket,
  MapPin,
  Wind,
  Target,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  BookOpen,
  Trophy,
  Star,
  Mouse,
  Ruler,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  Zap,
  MoveRight,
};

export default Icon;
