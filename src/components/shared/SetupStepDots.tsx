interface SetupStepDotsProps {
  totalSteps: number;
  currentStep: number;
  completedSteps: number[];
  onGoTo: (step: number) => void;
}

export function SetupStepDots({
  totalSteps,
  currentStep,
  completedSteps,
  onGoTo,
}: SetupStepDotsProps) {
  return (
    <div data-testid="setup-step-dots" className="flex items-center gap-2 justify-center py-4">
      {Array.from({ length: totalSteps }, (_, i) => {
        const isCompleted = completedSteps.includes(i);
        const isCurrent = i === currentStep;
        const isClickable = isCompleted;

        return (
          <button
            key={i}
            aria-current={isCurrent ? "step" : undefined}
            data-completed={isCompleted ? "true" : undefined}
            onClick={() => { if (isClickable) onGoTo(i); }}
            style={{ cursor: isClickable ? "pointer" : "default" }}
            className={`w-2.5 h-2.5 rounded-full transition-all border-0 p-0 ${
              isCurrent
                ? "bg-purple-500 ring-2 ring-purple-300 ring-offset-1 ring-offset-transparent scale-125"
                : isCompleted
                ? "bg-purple-700 hover:bg-purple-500"
                : "bg-white/20"
            }`}
          />
        );
      })}
    </div>
  );
}
