import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  reviewCount?: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
  className?: string;
}

export function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  showCount = false,
  reviewCount = 0,
  interactive = false,
  onRatingChange,
  className,
}: StarRatingProps) {
  const sizeClasses = {
    sm: "size-3",
    md: "size-4",
    lg: "size-5",
  };

  const handleStarClick = (starRating: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(starRating);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxRating }).map((_, index) => {
          const starValue = index + 1;
          const isFilled = starValue <= Math.round(rating);

          return (
            <button
              key={index}
              type="button"
              disabled={!interactive}
              onClick={() => handleStarClick(starValue)}
              className={cn(
                "transition-colors",
                interactive && "cursor-pointer hover:scale-110",
                !interactive && "cursor-default"
              )}
              aria-label={`${starValue} star${starValue !== 1 ? "s" : ""}`}
            >
              <Star
                className={cn(
                  sizeClasses[size],
                  isFilled
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-none text-gray-300 dark:text-gray-600"
                )}
              />
            </button>
          );
        })}
      </div>
      {rating > 0 && (
        <span className="text-sm font-medium text-foreground">
          {rating.toFixed(1)}
        </span>
      )}
      {showCount && reviewCount > 0 && (
        <span className="text-sm text-muted-foreground">
          ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
        </span>
      )}
    </div>
  );
}
